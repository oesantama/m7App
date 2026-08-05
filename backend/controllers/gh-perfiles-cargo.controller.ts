import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database.js';
import { parseWorkbook } from '../services/gh-perfiles-cargo-parser.service.js';
import { generatePerfilCargoPdf, generatePerfilCargoFirmadoPdf } from '../services/gh-perfiles-cargo-pdf.service.js';
import { uploadDocument } from '../services/hv-drive.service.js';

interface AuthRequest extends Request {
    user?: any;
}

const PDF_DIR = path.join(process.cwd(), 'backend', 'docs', 'pdf', 'perfiles-cargo');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ─── POST /gh-perfiles-cargo/upload (multer .xlsx en memoria) ────────────────
export const uploadExcel = async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió el archivo Excel' });

    try {
        const perfiles = parseWorkbook(req.file.buffer);
        const actor = req.user?.email || 'desconocido';
        const resumen = { creados: [] as string[], actualizados: [] as string[], sin_cambios: [] as string[] };

        for (const p of perfiles) {
            const existing = await pool.query(
                `SELECT * FROM gh_perfiles_cargo WHERE hoja_excel = $1 AND vigente = true`,
                [p.hoja]
            );

            if (existing.rows.length === 0) {
                const pdf = await generatePerfilCargoPdf(p.contenido, 1);
                const fileName = `${slug(p.hoja)}-v1.pdf`;
                fs.writeFileSync(path.join(PDF_DIR, fileName), pdf);
                await pool.query(
                    `INSERT INTO gh_perfiles_cargo (hoja_excel, version, vigente, contenido_json, content_hash, pdf_referencia_path, creado_por)
                     VALUES ($1, 1, true, $2, $3, $4, $5)`,
                    [p.hoja, JSON.stringify(p.contenido), p.contentHash, `backend/docs/pdf/perfiles-cargo/${fileName}`, actor]
                );
                resumen.creados.push(p.hoja);
            } else if (existing.rows[0].content_hash !== p.contentHash) {
                const prev = existing.rows[0];
                const newVersion = prev.version + 1;
                const pdf = await generatePerfilCargoPdf(p.contenido, newVersion);
                const fileName = `${slug(p.hoja)}-v${newVersion}.pdf`;
                fs.writeFileSync(path.join(PDF_DIR, fileName), pdf);
                await pool.query(`UPDATE gh_perfiles_cargo SET vigente = false WHERE id = $1`, [prev.id]);
                await pool.query(
                    `INSERT INTO gh_perfiles_cargo (hoja_excel, cargo_id, cargo_nombre, version, vigente, contenido_json, content_hash, pdf_referencia_path, creado_por)
                     VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)`,
                    [p.hoja, prev.cargo_id, prev.cargo_nombre, newVersion, JSON.stringify(p.contenido), p.contentHash, `backend/docs/pdf/perfiles-cargo/${fileName}`, actor]
                );
                resumen.actualizados.push(p.hoja);
            } else {
                resumen.sin_cambios.push(p.hoja);
            }
        }

        res.json({ success: true, data: resumen });
    } catch (error: any) {
        console.error('Error uploadExcel perfiles-cargo:', error);
        res.status(500).json({ success: false, error: 'Error al procesar el Excel' });
    }
};

// ─── GET /gh-perfiles-cargo (lista de perfiles vigentes) ─────────────────────
export const listPerfiles = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT pc.id, pc.hoja_excel, pc.cargo_id, pc.cargo_nombre, pc.version, pc.creado_at,
                   (SELECT COUNT(*) FROM gh_perfiles_cargo_firmas f WHERE f.perfil_id = pc.id AND f.estado = 'firmado') AS firmados,
                   (SELECT COUNT(*) FROM gh_perfiles_cargo_firmas f WHERE f.perfil_id = pc.id AND f.estado = 'pendiente') AS pendientes
            FROM gh_perfiles_cargo pc
            WHERE pc.vigente = true
            ORDER BY pc.hoja_excel ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error listPerfiles:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── POST /gh-perfiles-cargo/:id/mapear (asocia la hoja a un cargo del catálogo) ───
export const mapearCargo = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { cargo_id } = req.body;
    if (!cargo_id) return res.status(400).json({ success: false, error: 'cargo_id es obligatorio' });

    try {
        const cargoRes = await pool.query('SELECT nombre FROM gh_cargos WHERE id = $1', [cargo_id]);
        if (cargoRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Cargo no encontrado' });
        const cargoNombre = cargoRes.rows[0].nombre;

        const perfilRes = await pool.query(
            `UPDATE gh_perfiles_cargo SET cargo_id = $1, cargo_nombre = $2 WHERE id = $3 RETURNING *`,
            [cargo_id, cargoNombre, id]
        );
        if (perfilRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Perfil no encontrado' });
        const perfil = perfilRes.rows[0];

        // Genera pendientes automáticamente para el personal activo cuyo cargo coincide
        const personal = await pool.query(
            `SELECT id, nombre, cedula FROM gh_personal WHERE estado = 'EST-01' AND TRIM(LOWER(cargo)) = TRIM(LOWER($1))`,
            [cargoNombre]
        );
        let generados = 0;
        for (const persona of personal.rows) {
            const r = await pool.query(
                `INSERT INTO gh_perfiles_cargo_firmas (perfil_id, perfil_version, personal_id, cedula, nombre, estado)
                 VALUES ($1, $2, $3, $4, $5, 'pendiente')
                 ON CONFLICT (perfil_id, personal_id) DO NOTHING RETURNING id`,
                [perfil.id, perfil.version, persona.id, persona.cedula, persona.nombre]
            );
            if (r.rows.length > 0) generados++;
        }

        res.json({ success: true, data: { perfil, pendientes_generados: generados, personal_coincidente: personal.rows.length } });
    } catch (error: any) {
        console.error('Error mapearCargo:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /gh-perfiles-cargo/:id/pdf (descarga PDF de referencia, autenticado) ───
export const descargarPdfReferencia = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM gh_perfiles_cargo WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Perfil no encontrado' });
        const perfil = result.rows[0];
        const filePath = path.join(process.cwd(), perfil.pdf_referencia_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'PDF no disponible' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${perfil.hoja_excel}.pdf"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (error: any) {
        console.error('Error descargarPdfReferencia:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /gh-perfiles-cargo/tracking (panel de seguimiento HR) ───────────────
export const tracking = async (req: Request, res: Response) => {
    const { perfil_id } = req.query;
    try {
        const params: any[] = [];
        let where = '';
        if (perfil_id) { params.push(perfil_id); where = 'WHERE f.perfil_id = $1'; }
        const result = await pool.query(`
            SELECT f.*, pc.hoja_excel, pc.cargo_nombre
            FROM gh_perfiles_cargo_firmas f
            JOIN gh_perfiles_cargo pc ON pc.id = f.perfil_id
            ${where}
            ORDER BY f.estado ASC, f.nombre ASC
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error tracking:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /gh-perfiles-cargo/mis-pendientes (usuario autenticado) ────────────
export const misPendientes = async (req: AuthRequest, res: Response) => {
    const cedula = req.user?.document_number;
    if (!cedula) return res.json({ success: true, data: [] });

    try {
        const result = await pool.query(`
            SELECT f.id, f.estado, f.firmado_at, pc.id AS perfil_id, pc.hoja_excel, pc.cargo_nombre, pc.version
            FROM gh_perfiles_cargo_firmas f
            JOIN gh_perfiles_cargo pc ON pc.id = f.perfil_id
            WHERE TRIM(f.cedula) = TRIM($1)
            ORDER BY f.estado ASC, f.creado_at DESC
        `, [cedula]);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error misPendientes:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

async function ejecutarFirma(firmaId: number, firma_b64: string, ip: string, userAgent: string) {
    const firmaRes = await pool.query('SELECT * FROM gh_perfiles_cargo_firmas WHERE id = $1', [firmaId]);
    if (firmaRes.rows.length === 0) throw { status: 404, message: 'Registro de firma no encontrado' };
    const firma = firmaRes.rows[0];
    if (firma.estado === 'firmado') throw { status: 409, message: 'Este documento ya fue firmado' };

    const perfilRes = await pool.query('SELECT * FROM gh_perfiles_cargo WHERE id = $1', [firma.perfil_id]);
    const perfil = perfilRes.rows[0];

    const pdfBuffer = await generatePerfilCargoFirmadoPdf(perfil.contenido_json, firma.perfil_version, {
        nombre: firma.nombre,
        cedula: firma.cedula,
        firma_b64,
        firmado_at: new Date(),
        ip,
    });

    const nombreArchivo = `${slug(perfil.cargo_nombre || perfil.hoja_excel)}-v${firma.perfil_version}-firmado.pdf`;
    const identificador = `${firma.cedula} ${firma.nombre}`;
    const { drivePath, driveLink } = await uploadDocument(pdfBuffer, 'tercero', 'PerfilesCargo', identificador, nombreArchivo);

    await pool.query(
        `UPDATE gh_perfiles_cargo_firmas
         SET estado = 'firmado', firma_b64 = $1, firmado_ip = $2, firmado_user_agent = $3,
             firmado_at = NOW(), drive_path = $4, drive_link = $5, token = NULL, token_expira_at = NULL
         WHERE id = $6`,
        [firma_b64, ip, userAgent, drivePath, driveLink, firmaId]
    );

    return { drivePath, driveLink };
}

// ─── POST /gh-perfiles-cargo/firmas/:firmaId/firmar (usuario autenticado) ───
export const firmarAutenticado = async (req: AuthRequest, res: Response) => {
    const { firmaId } = req.params;
    const { firma_b64 } = req.body;
    if (!firma_b64) return res.status(400).json({ success: false, error: 'La firma es obligatoria' });

    try {
        const firmaRes = await pool.query('SELECT cedula FROM gh_perfiles_cargo_firmas WHERE id = $1', [firmaId]);
        if (firmaRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
        if (String(firmaRes.rows[0].cedula).trim() !== String(req.user?.document_number || '').trim()) {
            return res.status(403).json({ success: false, error: 'Este documento no te pertenece' });
        }

        const result = await ejecutarFirma(Number(firmaId), firma_b64, req.ip || '', req.headers['user-agent'] || '');
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('Error firmarAutenticado:', error);
        res.status(error.status || 500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

// ─── POST /gh-perfiles-cargo/firmas/:firmaId/generar-token (HR, autenticado) ───
export const generarToken = async (req: AuthRequest, res: Response) => {
    const { firmaId } = req.params;
    try {
        const token = crypto.randomBytes(24).toString('hex');
        const expira = new Date(Date.now() + TOKEN_TTL_MS);
        const result = await pool.query(
            `UPDATE gh_perfiles_cargo_firmas SET token = $1, token_expira_at = $2 WHERE id = $3 AND estado = 'pendiente' RETURNING cedula`,
            [token, expira, firmaId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Registro no encontrado o ya firmado' });

        // El link es una ruta del FRONTEND (SPA), no del backend — en producción comparten
        // dominio (orbitm7.m7apps.com), pero en desarrollo corren en puertos distintos.
        const frontendUrl = process.env.APP_URL
            || (process.env.NODE_ENV === 'production' ? 'https://orbitm7.m7apps.com' : (process.env.FRONTEND_URL || 'http://localhost:5174'));
        const link = `${frontendUrl.replace(/\/$/, '')}/public/perfil-cargo/${token}`;
        res.json({ success: true, data: { link, expira_at: expira, cedula: result.rows[0].cedula } });
    } catch (error: any) {
        console.error('Error generarToken:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

function last4(cedula: string) { return String(cedula || '').trim().slice(-4); }

// ─── GET /gh-perfiles-cargo/publico/:token?cedula_final=1234 (público) ──────
export const publicoVerificar = async (req: Request, res: Response) => {
    const { token } = req.params;
    const cedulaFinal = String(req.query.cedula_final || '');
    try {
        const result = await pool.query(`
            SELECT f.id, f.estado, f.cedula, f.nombre, f.token_expira_at, pc.cargo_nombre, pc.hoja_excel
            FROM gh_perfiles_cargo_firmas f
            JOIN gh_perfiles_cargo pc ON pc.id = f.perfil_id
            WHERE f.token = $1
        `, [token]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Enlace inválido o expirado' });
        const firma = result.rows[0];
        if (firma.estado === 'firmado') return res.status(409).json({ success: false, error: 'Este documento ya fue firmado' });
        if (new Date(firma.token_expira_at) < new Date()) return res.status(410).json({ success: false, error: 'El enlace expiró. Solicita uno nuevo a Gestión Humana.' });
        if (last4(firma.cedula) !== cedulaFinal.trim()) return res.status(401).json({ success: false, error: 'Los últimos 4 dígitos de la cédula no coinciden' });

        res.json({ success: true, data: { nombre: firma.nombre, cargo_nombre: firma.cargo_nombre, firma_id: firma.id } });
    } catch (error: any) {
        console.error('Error publicoVerificar:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /gh-perfiles-cargo/publico/:token/documento?cedula_final=1234 ──────
export const publicoDocumento = async (req: Request, res: Response) => {
    const { token } = req.params;
    const cedulaFinal = String(req.query.cedula_final || '');
    try {
        const result = await pool.query(`
            SELECT f.cedula, f.token_expira_at, f.estado, pc.pdf_referencia_path
            FROM gh_perfiles_cargo_firmas f
            JOIN gh_perfiles_cargo pc ON pc.id = f.perfil_id
            WHERE f.token = $1
        `, [token]);
        if (result.rows.length === 0) return res.status(404).send('Enlace inválido');
        const row = result.rows[0];
        if (row.estado === 'firmado' || new Date(row.token_expira_at) < new Date() || last4(row.cedula) !== cedulaFinal.trim()) {
            return res.status(401).send('Acceso no autorizado');
        }
        const filePath = path.join(process.cwd(), row.pdf_referencia_path);
        if (!fs.existsSync(filePath)) return res.status(404).send('PDF no disponible');
        res.setHeader('Content-Type', 'application/pdf');
        fs.createReadStream(filePath).pipe(res);
    } catch (error: any) {
        console.error('Error publicoDocumento:', error);
        res.status(500).send('Error del servidor');
    }
};

// ─── POST /gh-perfiles-cargo/publico/:token/firmar ──────────────────────────
export const publicoFirmar = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { cedula_final, firma_b64 } = req.body;
    if (!firma_b64 || !cedula_final) return res.status(400).json({ success: false, error: 'Datos incompletos' });

    try {
        const result = await pool.query('SELECT id, cedula, token_expira_at, estado FROM gh_perfiles_cargo_firmas WHERE token = $1', [token]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Enlace inválido' });
        const row = result.rows[0];
        if (row.estado === 'firmado') return res.status(409).json({ success: false, error: 'Este documento ya fue firmado' });
        if (new Date(row.token_expira_at) < new Date()) return res.status(410).json({ success: false, error: 'El enlace expiró' });
        if (last4(row.cedula) !== String(cedula_final).trim()) return res.status(401).json({ success: false, error: 'Cédula no coincide' });

        const data = await ejecutarFirma(row.id, firma_b64, req.ip || '', req.headers['user-agent'] || '');
        res.json({ success: true, data });
    } catch (error: any) {
        console.error('Error publicoFirmar:', error);
        res.status(error.status || 500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};
