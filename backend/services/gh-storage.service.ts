/**
 * gh-storage.service.ts
 * Almacenamiento de evidencias de Gestión Humana (Activos y Mensajería) en Google Drive vía rclone.
 *
 * Flujo:
 *   1. El controlador valida el archivo (tipo real por bytes iniciales, tamaño) y calcula SHA-256.
 *   2. El archivo se guarda en la cola local (backend/docs/gh-cola/) y la fila queda PENDIENTE.
 *      El usuario recibe respuesta de inmediato: no espera a Drive.
 *   3. processUploadQueue() sube a Drive en segundo plano; si falla, reintenta (cron cada 5 min).
 *   4. Los archivos se sirven SIEMPRE a través del backend autenticado (streamStoredFile);
 *      nunca se generan links públicos de Drive (`rclone link`).
 *
 * A diferencia de hv-drive.service, aquí rclone se invoca con spawn y argumentos separados
 * (sin shell), así una ruta con comillas o `$()` no puede inyectar comandos.
 */

import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import pool from '../config/database.js';

const RCLONE_REMOTE = process.env.GH_DRIVE_REMOTE || 'gdrive_cumplidos';
// Carpeta raíz con la convención del Drive ("<TEMA> MILLA 7"). En desarrollo se usa otra raíz
// para no mezclar pruebas con evidencias reales.
export const GH_DRIVE_BASE = process.env.GH_DRIVE_BASE
    || (process.env.NODE_ENV === 'production' ? 'GESTION HUMANA MILLA 7' : 'GESTION HUMANA MILLA 7 (PRUEBAS)');
const QUEUE_DIR = path.join(process.cwd(), 'backend', 'docs', 'gh-cola');
const MAX_REINTENTOS = 10;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export type StorageTable = 'gh_activos_archivos' | 'gh_mensajeria_archivos';

// ── Validación de archivos ────────────────────────────────────────────────────

/** Detecta el tipo real del archivo por sus bytes iniciales (no confía en la extensión ni en el Content-Type). */
export function detectMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | null {
    if (buf.length < 12) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
    return null;
}

export const EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

export interface ValidatedFile {
    mime: string;
    ext: string;
    sha256: string;
    size: number;
}

/**
 * Valida un archivo subido. `allow` define qué tipos se aceptan; las imágenes tienen
 * límite de 5 MB y los PDF de 10 MB. Lanza Error con mensaje para el usuario.
 */
export function validateUpload(buf: Buffer | undefined, allow: Array<'image' | 'pdf' | 'png'>): ValidatedFile {
    if (!buf || buf.length === 0) throw new Error('El archivo está vacío.');
    const mime = detectMime(buf);
    const allowed =
        (mime === 'image/png' && (allow.includes('image') || allow.includes('png'))) ||
        ((mime === 'image/jpeg' || mime === 'image/webp') && allow.includes('image')) ||
        (mime === 'application/pdf' && allow.includes('pdf'));
    if (!mime || !allowed) throw new Error('Tipo de archivo no permitido.');
    const limit = mime === 'application/pdf' ? MAX_DOC_BYTES : MAX_IMAGE_BYTES;
    if (buf.length > limit) throw new Error(`El archivo supera el máximo de ${Math.round(limit / 1024 / 1024)} MB.`);
    return { mime, ext: EXT_BY_MIME[mime], sha256: sha256(buf), size: buf.length };
}

export function sha256(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Limpia un segmento de ruta para Drive (sin `..`, `/` ni caracteres raros). */
export function safeSegment(name: string): string {
    return String(name)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9\s\-_.()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80) || 'SIN_NOMBRE';
}

// ── Organización de carpetas en Drive ─────────────────────────────────────────
//
//   GESTION HUMANA MILLA 7/
//   ├── HOJA DE VIDA ACTIVOS/{TIPO}/{ACT-00001 - NOMBRE}/{AÑO}/{AAAA-MM-DD} {EVENTO} #{evento}-{n}.ext
//   └── MENSAJERIA/{AÑO}/{MM - MES}/{ENV-AAMMDD-NNNN - DESTINATARIO}/
//       ├── FIRMAS/FIRMA MENSAJERO #{evento}.png | FIRMA DESTINATARIO #{evento}.png
//       └── EVIDENCIAS/FOTO PAQUETE #{evento}.jpg | FOTO ENTREGA … | FOTO INCIDENCIA …
//
// El número de evento en el nombre evita sobrescribir evidencias cuando un envío se
// reintenta (dos recogidas generan dos firmas del mensajero).

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
    'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Año y mes en hora de Colombia (el servidor puede estar en UTC). */
function anioMesBogota(fecha: Date): { anio: string; mes: number } {
    const [anio, mes] = fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-');
    return { anio, mes: Number(mes) };
}

export function rutaArchivoActivo(p: {
    tipo: string; codigo: string; nombre: string; fecha: string; evento: string; eventoId: number; n: number; ext: string;
}): string {
    const anio = p.fecha.slice(0, 4);
    const evento = p.evento.replace(/_/g, ' ');
    return `${GH_DRIVE_BASE}/HOJA DE VIDA ACTIVOS/${safeSegment(p.tipo)}/${safeSegment(`${p.codigo} - ${p.nombre}`)}`
        + `/${anio}/${p.fecha} ${evento} #${p.eventoId}-${p.n}.${p.ext}`;
}

export function rutaArchivoEnvio(p: {
    creado: Date; tracking: string; destinatario: string; tipo: string; eventoId: number; ext: string;
}): string {
    const { anio, mes } = anioMesBogota(p.creado);
    const carpetaMes = `${String(mes).padStart(2, '0')} - ${MESES[mes - 1]}`;
    const sub = p.tipo.startsWith('FIRMA') ? 'FIRMAS' : 'EVIDENCIAS';
    return `${GH_DRIVE_BASE}/MENSAJERIA/${anio}/${carpetaMes}/${safeSegment(`${p.tracking} - ${p.destinatario}`)}`
        + `/${sub}/${p.tipo.replace(/_/g, ' ')} #${p.eventoId}.${p.ext}`;
}

// ── Cola local ────────────────────────────────────────────────────────────────

/** Guarda el buffer en la cola local y devuelve su ruta absoluta. */
export function saveToQueue(buf: Buffer, ext: string): string {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    const file = path.join(QUEUE_DIR, `${Date.now()}_${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(file, buf, { mode: 0o600 });
    return file;
}

function isInsideQueue(p: string): boolean {
    const resolved = path.resolve(p);
    return resolved.startsWith(path.resolve(QUEUE_DIR) + path.sep);
}

// ── rclone (sin shell) ────────────────────────────────────────────────────────

function runRclone(args: string[], timeoutMs = 120_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn('rclone', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('rclone timeout')); }, timeoutMs);
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('error', err => { clearTimeout(timer); reject(err); });
        proc.on('close', code => {
            clearTimeout(timer);
            code === 0 ? resolve() : reject(new Error(stderr.trim().slice(-500) || `rclone exit ${code}`));
        });
    });
}

let rcloneOk: boolean | null = null;
async function rcloneAvailable(): Promise<boolean> {
    if (rcloneOk !== null) return rcloneOk;
    rcloneOk = await runRclone(['version'], 10_000).then(() => true).catch(() => false);
    return rcloneOk;
}

// ── Procesador de la cola ─────────────────────────────────────────────────────

let processing = false;
let rerunRequested = false;

/**
 * Sube a Drive los archivos PENDIENTE/ERROR de ambas tablas. Seguro de llamar varias veces:
 * si ya hay una ejecución en curso, se agenda otra pasada al terminar (para no dejar
 * esperando hasta el cron los archivos que llegaron mientras tanto).
 */
export async function processUploadQueue(): Promise<{ subidos: number; errores: number }> {
    if (processing) {
        rerunRequested = true;
        return { subidos: 0, errores: 0 };
    }
    processing = true;
    rerunRequested = false;
    let subidos = 0, errores = 0;
    try {
        if (!(await rcloneAvailable())) return { subidos, errores };
        for (const table of ['gh_mensajeria_archivos', 'gh_activos_archivos'] as StorageTable[]) {
            const { rows } = await pool.query(
                `SELECT id, drive_path, local_path FROM ${table}
                 WHERE estado_subida IN ('PENDIENTE','ERROR') AND reintentos < $1
                 ORDER BY id LIMIT 50`,
                [MAX_REINTENTOS]
            );
            for (const row of rows) {
                if (!row.local_path || !fs.existsSync(row.local_path)) {
                    await pool.query(
                        `UPDATE ${table} SET estado_subida='ERROR', reintentos=$2, ultimo_error=$3 WHERE id=$1`,
                        [row.id, MAX_REINTENTOS, 'Archivo local no encontrado']
                    );
                    errores++;
                    continue;
                }
                try {
                    await runRclone(['copyto', row.local_path, `${RCLONE_REMOTE}:${row.drive_path}`]);
                    await pool.query(
                        `UPDATE ${table} SET estado_subida='SUBIDO', local_path=NULL, ultimo_error=NULL WHERE id=$1`,
                        [row.id]
                    );
                    if (isInsideQueue(row.local_path)) fs.promises.unlink(row.local_path).catch(() => {});
                    subidos++;
                } catch (err: any) {
                    await pool.query(
                        `UPDATE ${table} SET estado_subida='ERROR', reintentos=reintentos+1, ultimo_error=$2 WHERE id=$1`,
                        [row.id, String(err.message).slice(0, 500)]
                    );
                    errores++;
                }
            }
        }
    } catch (err: any) {
        console.error('[GH-STORAGE] Error procesando cola:', err.message);
    } finally {
        processing = false;
    }
    if (subidos || errores) console.log(`[GH-STORAGE] Cola Drive: ${subidos} subidos, ${errores} con error`);
    if (rerunRequested) triggerUpload();
    return { subidos, errores };
}

/** Dispara la subida en segundo plano sin bloquear la respuesta HTTP. */
export function triggerUpload(): void {
    setImmediate(() => { processUploadQueue().catch(() => {}); });
}

// ── Lectura ───────────────────────────────────────────────────────────────────

/**
 * Devuelve un stream del archivo: desde la cola local si aún no se subió, o desde Drive.
 * El llamador debe haber verificado permisos antes.
 */
export function streamStoredFile(row: { drive_path: string; local_path?: string | null }): NodeJS.ReadableStream {
    if (row.local_path && isInsideQueue(row.local_path) && fs.existsSync(row.local_path)) {
        return fs.createReadStream(row.local_path);
    }
    const proc = spawn('rclone', ['cat', `${RCLONE_REMOTE}:${row.drive_path}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    return proc.stdout;
}
