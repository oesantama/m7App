import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database.js';
import { generateActaInventarioPdf } from '../services/it-activos-pdf.service.js';

interface AuthRequest extends Request {
    user?: any;
}

const PDF_DIR = path.join(process.cwd(), 'backend', 'docs', 'pdf', 'actas-inventario');
if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
}

const SCRIPTS_DIR = path.join(process.cwd(), 'backend', 'docs', 'scripts');
const SCRIPT_TEMPLATES: Record<string, { file: string; ext: string; contentType: string }> = {
    windows: { file: 'inventario-agente.ps1', ext: 'ps1', contentType: 'text/plain; charset=utf-8' },
    linux: { file: 'inventario-agente.sh', ext: 'sh', contentType: 'text/x-shellscript; charset=utf-8' },
    mac: { file: 'inventario-agente.sh', ext: 'sh', contentType: 'text/x-shellscript; charset=utf-8' },
};

// ─── GET /it-activos ──────────────────────────────────────────────────────────
export const listInventario = async (req: Request, res: Response) => {
    const { serial, custodio, area, estado } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (serial) {
        params.push(`%${serial}%`);
        conditions.push(`serial_number ILIKE $${params.length}`);
    }
    if (custodio) {
        params.push(`%${custodio}%`);
        conditions.push(`assigned_to_name ILIKE $${params.length}`);
    }
    if (area) {
        params.push(`%${area}%`);
        conditions.push(`department ILIKE $${params.length}`);
    }
    if (estado) {
        params.push(estado);
        conditions.push(`physical_condition = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const result = await pool.query(
            `SELECT * FROM it_activos_inventario ${where} ORDER BY updated_at DESC`,
            params
        );
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error listInventario:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /it-activos/:serial ──────────────────────────────────────────────────
export const getBySerial = async (req: Request, res: Response) => {
    const { serial } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM it_activos_inventario WHERE serial_number = $1',
            [serial]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Equipo no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error getBySerial:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

function buildUpsertParams(body: any, actor: string) {
    const {
        serial_number, hostname, system_user, brand, model,
        os_name, os_version, os_license_status,
        office_version, office_license_status, peripherals,
        assigned_to_name, assigned_to_id, department, location,
        physical_condition, notes, conformity_accepted
    } = body;

    return [
        serial_number, hostname || null, system_user || null, brand || null, model || null,
        os_name || null, os_version || null, os_license_status || null,
        office_version || null, office_license_status || null,
        JSON.stringify(peripherals || []),
        assigned_to_name || null, assigned_to_id || null, department || null, location || null,
        physical_condition || null, notes || null, !!conformity_accepted,
        actor
    ];
}

const UPSERT_SQL = `
    INSERT INTO it_activos_inventario (
        serial_number, hostname, system_user, brand, model,
        os_name, os_version, os_license_status,
        office_version, office_license_status, peripherals,
        assigned_to_name, assigned_to_id, department, location,
        physical_condition, notes, conformity_accepted,
        created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
    ON CONFLICT (serial_number) DO UPDATE SET
        hostname = COALESCE(EXCLUDED.hostname, it_activos_inventario.hostname),
        system_user = COALESCE(EXCLUDED.system_user, it_activos_inventario.system_user),
        brand = COALESCE(EXCLUDED.brand, it_activos_inventario.brand),
        model = COALESCE(EXCLUDED.model, it_activos_inventario.model),
        os_name = COALESCE(EXCLUDED.os_name, it_activos_inventario.os_name),
        os_version = COALESCE(EXCLUDED.os_version, it_activos_inventario.os_version),
        os_license_status = COALESCE(EXCLUDED.os_license_status, it_activos_inventario.os_license_status),
        office_version = COALESCE(EXCLUDED.office_version, it_activos_inventario.office_version),
        office_license_status = COALESCE(EXCLUDED.office_license_status, it_activos_inventario.office_license_status),
        peripherals = CASE WHEN EXCLUDED.peripherals = '[]'::jsonb THEN it_activos_inventario.peripherals ELSE EXCLUDED.peripherals END,
        assigned_to_name = COALESCE(EXCLUDED.assigned_to_name, it_activos_inventario.assigned_to_name),
        assigned_to_id = COALESCE(EXCLUDED.assigned_to_id, it_activos_inventario.assigned_to_id),
        department = COALESCE(EXCLUDED.department, it_activos_inventario.department),
        location = COALESCE(EXCLUDED.location, it_activos_inventario.location),
        physical_condition = COALESCE(EXCLUDED.physical_condition, it_activos_inventario.physical_condition),
        notes = COALESCE(EXCLUDED.notes, it_activos_inventario.notes),
        conformity_accepted = EXCLUDED.conformity_accepted OR it_activos_inventario.conformity_accepted,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    RETURNING *;
`;

// ─── POST /it-activos/manual (usuario autenticado desde el formulario web) ───
export const upsertInventario = async (req: AuthRequest, res: Response) => {
    const { serial_number } = req.body;
    if (!serial_number) {
        return res.status(400).json({ success: false, error: 'El número de serie es obligatorio' });
    }

    try {
        const actor = req.user?.email || 'desconocido';
        const result = await pool.query(UPSERT_SQL, buildUpsertParams(req.body, actor));
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error upsertInventario:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── POST /it-activos/upload-json (script PowerShell/Bash, autenticado por API Key) ───
export const uploadJson = async (req: Request, res: Response) => {
    const { serial_number, hostname } = req.body;
    if (!serial_number || !hostname) {
        return res.status(400).json({ success: false, error: 'serial_number y hostname son obligatorios' });
    }

    try {
        const result = await pool.query(UPSERT_SQL, buildUpsertParams(req.body, 'script-agente'));
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error uploadJson:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ─── GET /it-activos/:id/acta-pdf ─────────────────────────────────────────────
export const generateActaPdf = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM it_activos_inventario WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Equipo no encontrado' });
        }
        const row = result.rows[0];
        const pdfBuffer = await generateActaInventarioPdf({
            ...row,
            peripherals: Array.isArray(row.peripherals) ? row.peripherals : []
        });

        const fileName = `${row.serial_number}-${Date.now()}.pdf`;
        const filePath = path.join(PDF_DIR, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        const relativeUrl = `docs/pdf/actas-inventario/${fileName}`;
        await pool.query('UPDATE it_activos_inventario SET pdf_acta_url = $1 WHERE id = $2', [relativeUrl, id]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Acta-Inventario-${row.serial_number}.pdf"`);
        res.send(pdfBuffer);
    } catch (error: any) {
        console.error('Error generateActaPdf:', error);
        res.status(500).json({ success: false, error: 'Error del servidor al generar el PDF' });
    }
};

// ─── GET /it-activos/areas ─────────────────────────────────────────────────────
export const listAreas = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, nombre FROM gh_areas WHERE estado = 'EST-01' ORDER BY nombre ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error listAreas:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Resuelve la URL pública según el entorno: producción usa el dominio real,
// desarrollo usa BACKEND_URL/localhost. APP_URL, si está definida, siempre gana.
function getAppUrl(): string {
    if (process.env.APP_URL) return process.env.APP_URL;
    if (process.env.NODE_ENV === 'production') return 'https://orbitm7.m7apps.com';
    return process.env.BACKEND_URL || 'http://localhost:8081';
}

function renderScript(osParam: string): { script: string; config: typeof SCRIPT_TEMPLATES['windows'] } {
    const config = SCRIPT_TEMPLATES[osParam] || SCRIPT_TEMPLATES.windows;
    const template = fs.readFileSync(path.join(SCRIPTS_DIR, config.file), 'utf8');
    const appUrl = getAppUrl();
    const apiKey = process.env.INVENTARIO_SCRIPT_KEY || '';

    const script = template
        .replace(/__API_URL__/g, appUrl)
        .replace(/__API_KEY__/g, apiKey);

    return { script, config };
}

// ─── GET /it-activos/script?os=windows|linux|mac (descarga el script con URL y API Key embebidas) ───
export const downloadScript = async (req: Request, res: Response) => {
    try {
        const osParam = String(req.query.os || 'windows').toLowerCase();
        const { script, config } = renderScript(osParam);

        res.setHeader('Content-Type', config.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="inventario-agente.${config.ext}"`);
        res.send(script);
    } catch (error: any) {
        console.error('Error downloadScript:', error);
        res.status(500).json({ success: false, error: 'No se pudo generar el script' });
    }
};

// Tokens de un solo uso para el flujo "curl | bash" — evitan exponer la API Key en un enlace permanente
interface ScriptToken { os: string; expiresAt: number; }
const scriptTokens = new Map<string, ScriptToken>();
const SCRIPT_TOKEN_TTL_MS = 15 * 60 * 1000;

function purgeExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of scriptTokens.entries()) {
        if (data.expiresAt < now) scriptTokens.delete(token);
    }
}

// ─── POST /it-activos/script/token (usuario autenticado — genera el comando de instalación) ───
export const generateScriptToken = async (req: Request, res: Response) => {
    purgeExpiredTokens();
    const osParam = String(req.body.os || 'windows').toLowerCase();
    if (!SCRIPT_TEMPLATES[osParam]) {
        return res.status(400).json({ success: false, error: 'Sistema operativo no soportado' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    scriptTokens.set(token, { os: osParam, expiresAt: Date.now() + SCRIPT_TOKEN_TTL_MS });

    const appUrl = getAppUrl();
    const downloadUrl = `${appUrl}/api/it-activos/script/dl/${token}`;
    // En Linux/Mac se descarga a un archivo temporal (no se usa "curl | bash" a secas)
    // porque el script necesita re-ejecutarse a sí mismo con sudo para leer el serial
    // real de hardware, y eso requiere que "$0" sea una ruta de archivo válida.
    const command = osParam === 'windows'
        ? `irm "${downloadUrl}" | iex`
        : `curl -fsSL "${downloadUrl}" -o /tmp/orbit-inventario.sh && bash /tmp/orbit-inventario.sh; rm -f /tmp/orbit-inventario.sh`;

    res.json({ success: true, data: { command, expiresInMinutes: SCRIPT_TOKEN_TTL_MS / 60000 } });
};

// ─── GET /it-activos/script/dl/:token (público, un solo uso, expira en 15 min) ───
export const downloadScriptByToken = async (req: Request, res: Response) => {
    purgeExpiredTokens();
    const token = String(req.params.token || '');
    const entry = scriptTokens.get(token);

    if (!entry || entry.expiresAt < Date.now()) {
        return res.status(404).send('Enlace inválido o expirado. Genere un nuevo comando desde OrbitM7.');
    }
    scriptTokens.delete(token); // un solo uso

    try {
        const { script, config } = renderScript(entry.os);
        res.setHeader('Content-Type', config.contentType);
        res.send(script);
    } catch (error: any) {
        console.error('Error downloadScriptByToken:', error);
        res.status(500).send('No se pudo generar el script');
    }
};
