/**
 * hv-drive.service.ts
 * Servicio Drive para Hojas de Vida — reutiliza rclone existente.
 * Estructura en Drive:
 *   Vehículos  → gdrive_cumplidos: Placas/{PLACA}/{archivo.pdf}
 *   Conductores→ gdrive_cumplidos: Terceros/Conductores/{CC Nombre}/{archivo.pdf}
 *   Propietarios→gdrive_cumplidos: Terceros/Propietarios/{CC Nombre}/{archivo.pdf}
 *   Tenedores  → gdrive_cumplidos: Terceros/Tenedores/{CC Nombre}/{archivo.pdf}
 */

import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RCLONE_REMOTE = 'gdrive_cumplidos';

export function sanitizeFolderName(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80);
}

export function buildDrivePath(
    tipoEntidad: 'vehiculo' | 'tercero',
    tipoTercero: string | null,
    identificador: string,
    nombreArchivo: string
): string {
    const id = sanitizeFolderName(identificador);
    if (tipoEntidad === 'vehiculo') {
        return `Placas/${id}/${nombreArchivo}`;
    }
    const tipo = tipoTercero
        ? sanitizeFolderName(tipoTercero.charAt(0).toUpperCase() + tipoTercero.slice(1) + 's')
        : 'Terceros';
    return `Terceros/${tipo}/${id}/${nombreArchivo}`;
}

export function rcloneAvailable(): Promise<boolean> {
    return new Promise(resolve => exec('which rclone', err => resolve(!err)));
}

export function rcloneMkdir(remotePath: string): Promise<void> {
    return new Promise((resolve) => {
        exec(`rclone mkdir "${RCLONE_REMOTE}:${remotePath}"`, () => resolve());
    });
}

export function rcloneCopyto(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        exec(`rclone copyto "${localPath}" "${RCLONE_REMOTE}:${remotePath}"`, (err, _stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve();
        });
    });
}

export function rcloneLink(remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(`rclone link "${RCLONE_REMOTE}:${remotePath}"`, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout.trim());
        });
    });
}

export function rcloneDelete(remotePath: string): Promise<void> {
    return new Promise(resolve => {
        exec(`rclone deletefile "${RCLONE_REMOTE}:${remotePath}"`, () => resolve());
    });
}

export function rcloneCat(remotePath: string): NodeJS.ReadableStream {
    return spawn('rclone', ['cat', `${RCLONE_REMOTE}:${remotePath}`]).stdout!;
}

/**
 * Sube un buffer a Drive y retorna { drivePath, driveLink }
 */
export async function uploadBufferToDrive(
    buffer: Buffer,
    drivePath: string
): Promise<{ drivePath: string; driveLink: string }> {
    const tmpPath = path.join(os.tmpdir(), `hv_upload_${Date.now()}_${path.basename(drivePath)}`);
    try {
        fs.writeFileSync(tmpPath, buffer);
        const folder = path.dirname(drivePath);
        await rcloneMkdir(folder);
        await rcloneCopyto(tmpPath, drivePath);
        const driveLink = await rcloneLink(drivePath);
        return { drivePath, driveLink };
    } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
}

/**
 * Fallback local cuando rclone no está disponible
 */
const LOCAL_BASE = path.join(process.cwd(), 'backend', 'docs', 'hojas-vida');

export async function saveLocalFallback(
    buffer: Buffer,
    drivePath: string
): Promise<{ drivePath: string; driveLink: string }> {
    const localPath = path.join(LOCAL_BASE, drivePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    return {
        drivePath: `local:${drivePath}`,
        driveLink: `/api/hv/file?p=${encodeURIComponent(drivePath)}`,
    };
}

export async function uploadDocument(
    buffer: Buffer,
    tipoEntidad: 'vehiculo' | 'tercero',
    tipoTercero: string | null,
    identificador: string,
    nombreArchivo: string
): Promise<{ drivePath: string; driveLink: string }> {
    const drivePath = buildDrivePath(tipoEntidad, tipoTercero, identificador, nombreArchivo);
    const available = await rcloneAvailable();
    if (available) {
        return uploadBufferToDrive(buffer, drivePath);
    }
    return saveLocalFallback(buffer, drivePath);
}
