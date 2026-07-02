/**
 * hojas-vida.controller.ts
 * Controller principal del sistema de Hojas de Vida (MOD-14)
 * Cubre: solicitudes, documentos, estados, KPIs, maestras, auditoría
 */

import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import pool from '../config/database.js';
import { uploadDocument, rcloneCat, rcloneAvailable } from '../services/hv-drive.service.js';
import { convertToPdf, validateUpload } from '../services/hv-convert.service.js';
import * as path from 'path';
import * as fs from 'fs';

const JWT_SECRET = process.env.JWT_SECRET || 'm7secret';
const TOKEN_HOURS_DEFAULT = 72;
const LOCAL_BASE = path.join(process.cwd(), 'backend', 'docs', 'hojas-vida');

// ─── UTILIDADES ──────────────────────────────────────────────────────────────

function getIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

function detectDevice(ua: string = ''): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
    const u = ua.toLowerCase();
    if (/mobi|android|iphone/.test(u)) return 'mobile';
    if (/ipad|tablet/.test(u)) return 'tablet';
    if (u.length > 5) return 'desktop';
    return 'unknown';
}

async function registrarAuditoria(
    solicitudId: string | null,
    accion: string,
    entidad: string,
    entidadId: string | null,
    usuarioId: string | null,
    usuarioNombre: string | null,
    ip: string,
    valorAnterior?: any,
    valorNuevo?: any,
    detalle?: any
) {
    try {
        await pool.query(
            `INSERT INTO hv_auditoria
             (solicitud_id,accion,entidad,entidad_id,usuario_id,usuario_nombre,usuario_ip,valor_anterior,valor_nuevo,detalle)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [solicitudId, accion, entidad, entidadId, usuarioId, usuarioNombre, ip,
             valorAnterior ? JSON.stringify(valorAnterior) : null,
             valorNuevo ? JSON.stringify(valorNuevo) : null,
             detalle ? JSON.stringify(detalle) : null]
        );
    } catch { /* no bloquear flujo principal */ }
}

async function cambiarEstado(
    solicitudId: string,
    estadoNuevo: string,
    usuarioId: string | null,
    usuarioNombre: string | null,
    ip: string,
    observacion?: string
) {
    const { rows } = await pool.query(
        'SELECT estado FROM hv_solicitudes WHERE id=$1', [solicitudId]
    );
    const estadoAnt = rows[0]?.estado;

    const tsField: Record<string, string> = {
        enviada: 'enviada_at',
        aprobada: 'aprobada_at',
        rechazada: 'rechazada_at',
        completa: 'completada_at',
    };
    const tsUpdate = tsField[estadoNuevo] ? `, ${tsField[estadoNuevo]}=NOW()` : '';

    await pool.query(
        `UPDATE hv_solicitudes SET estado=$1, updated_at=NOW()${tsUpdate} WHERE id=$2`,
        [estadoNuevo, solicitudId]
    );
    await pool.query(
        `INSERT INTO hv_estados_historial
         (solicitud_id,estado_ant,estado_nuevo,usuario_id,usuario_nombre,usuario_ip,observacion)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [solicitudId, estadoAnt, estadoNuevo, usuarioId, usuarioNombre, ip, observacion || null]
    );
}

// ─── CATÁLOGOS (GET públicos para el formulario) ──────────────────────────────

export const getCatalogos = async (req: Request, res: Response) => {
    try {
        const [tipos, docsReq, campos] = await Promise.all([
            pool.query('SELECT * FROM hv_tipos_tercero WHERE activo=TRUE ORDER BY orden'),
            pool.query('SELECT * FROM hv_tipos_documento_req WHERE activo=TRUE ORDER BY tipo_entidad,tipo_tercero_id,orden'),
            pool.query('SELECT * FROM hv_campos_formulario WHERE activo=TRUE ORDER BY tipo_entidad,tipo_tercero_id,orden'),
        ]);
        res.json({
            tipos_tercero: tipos.rows,
            tipos_documento: docsReq.rows,
            campos_formulario: campos.rows,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── SOLICITUDES ─────────────────────────────────────────────────────────────

export const crearSolicitud = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const {
        tipo_entidad, entidad_id, tipo_tercero_id,
        nombre_entidad, horas_expiracion = TOKEN_HOURS_DEFAULT,
    } = req.body;

    if (!tipo_entidad || !['vehiculo','tercero'].includes(tipo_entidad)) {
        return res.status(400).json({ error: 'tipo_entidad debe ser vehiculo o tercero' });
    }

    try {
        const token = crypto.randomBytes(24).toString('base64url');
        const expira = new Date(Date.now() + horas_expiracion * 3600 * 1000);

        const { rows } = await pool.query(
            `INSERT INTO hv_solicitudes
             (tipo_entidad,entidad_id,tipo_tercero_id,nombre_entidad,token,token_expira_at,creado_por)
             VALUES($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [tipo_entidad, entidad_id || null, tipo_tercero_id || null,
             nombre_entidad || null, token, expira, user.id]
        );
        const sol = rows[0];

        // Historial inicial
        await pool.query(
            `INSERT INTO hv_estados_historial
             (solicitud_id,estado_ant,estado_nuevo,usuario_id,usuario_nombre,usuario_ip,observacion)
             VALUES($1,NULL,'creada',$2,$3,$4,'Solicitud creada')`,
            [sol.id, user.id, user.name, getIp(req)]
        );

        await registrarAuditoria(sol.id, 'create', 'solicitud', sol.id,
            user.id, user.name, getIp(req), null, { estado: 'creada', tipo_entidad });

        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5174';
        res.json({ ...sol, link_publico: `${baseUrl}/documentacion/${token}` });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const listarSolicitudes = async (req: Request, res: Response) => {
    const {
        estado, tipo_entidad, tipo_tercero_id,
        page = 1, limit = 20, q = '',
    } = req.query;

    try {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];

        if (estado) { params.push(estado); conditions.push(`s.estado=$${params.length}`); }
        if (tipo_entidad) { params.push(tipo_entidad); conditions.push(`s.tipo_entidad=$${params.length}`); }
        if (tipo_tercero_id) { params.push(tipo_tercero_id); conditions.push(`s.tipo_tercero_id=$${params.length}`); }
        if (q) {
            params.push(`%${q}%`);
            conditions.push(`(s.nombre_entidad ILIKE $${params.length} OR s.token ILIKE $${params.length})`);
        }

        const where = conditions.join(' AND ');
        const offset = (Number(page) - 1) * Number(limit);
        params.push(Number(limit), offset);

        const { rows } = await pool.query(`
            SELECT s.*,
                   t.nombre AS tipo_tercero_nombre,
                   u.name   AS creado_por_nombre,
                   (SELECT COUNT(*) FROM hv_documentos d WHERE d.solicitud_id=s.id) AS total_docs,
                   (SELECT COUNT(*) FROM hv_documentos d WHERE d.solicitud_id=s.id AND d.estado='aprobado') AS docs_aprobados
            FROM hv_solicitudes s
            LEFT JOIN hv_tipos_tercero t ON t.id=s.tipo_tercero_id
            LEFT JOIN users u ON u.id=s.creado_por
            WHERE ${where}
            ORDER BY s.created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM hv_solicitudes s WHERE ${where}`,
            params.slice(0, -2)
        );

        res.json({ data: rows, total: Number(countRes.rows[0].count), page: Number(page) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const getSolicitud = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = req.params['id'] as string;
    try {
        const { rows } = await pool.query(`
            SELECT s.*,
                   t.nombre AS tipo_tercero_nombre, t.codigo AS tipo_tercero_codigo,
                   u.name AS creado_por_nombre
            FROM hv_solicitudes s
            LEFT JOIN hv_tipos_tercero t ON t.id=s.tipo_tercero_id
            LEFT JOIN users u ON u.id=s.creado_por
            WHERE s.id=$1
        `, [id]);
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const [docs, historial, accesos, envios] = await Promise.all([
            pool.query('SELECT * FROM hv_documentos WHERE solicitud_id=$1 ORDER BY nombre_doc', [id]),
            pool.query('SELECT * FROM hv_estados_historial WHERE solicitud_id=$1 ORDER BY created_at', [id]),
            pool.query('SELECT * FROM hv_accesos_link WHERE solicitud_id=$1 ORDER BY inicio_at DESC LIMIT 20', [id]),
            pool.query('SELECT el.*, u.name as enviado_por_nombre FROM hv_envios_link el LEFT JOIN users u ON u.id=el.enviado_por WHERE el.solicitud_id=$1 ORDER BY el.sent_at DESC', [id]),
        ]);

        await registrarAuditoria(id, 'view', 'solicitud', id, user.id, user.name, getIp(req));

        res.json({
            ...rows[0],
            documentos: docs.rows,
            historial: historial.rows,
            accesos: accesos.rows,
            envios: envios.rows,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const cambiarEstadoSolicitud = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = req.params['id'] as string;
    const { estado, observacion } = req.body;

    const estadosValidos = [
        'creada','link_enviado','abierta','en_diligenciamiento','enviada',
        'pendiente_aprobacion','en_revision','correcciones_solicitadas',
        'corregida','aprobada','rechazada',
        'doc_fisica_pendiente','doc_fisica_recibida','completa'
    ];
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
        await cambiarEstado(id, estado, user.id, user.name, getIp(req), observacion);

        if (estado === 'obs_revision' || estado === 'obs_rechazo') {
            await pool.query(`UPDATE hv_solicitudes SET ${estado}=$1 WHERE id=$2`, [observacion, id]);
        }

        await registrarAuditoria(id, 'cambio_estado', 'solicitud', id,
            user.id, user.name, getIp(req), null, { estado }, { observacion });

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const reenviarLink = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = req.params['id'] as string;
    const { enviado_a, canal = 'manual', mensaje, horas_extra } = req.body;

    try {
        const { rows } = await pool.query('SELECT * FROM hv_solicitudes WHERE id=$1', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
        const sol = rows[0];

        // Si expiró, renovar token
        if (new Date(sol.token_expira_at) < new Date()) {
            const nuevoToken = crypto.randomBytes(24).toString('base64url');
            const horas = horas_extra || TOKEN_HOURS_DEFAULT;
            const expira = new Date(Date.now() + horas * 3600 * 1000);
            await pool.query(
                'UPDATE hv_solicitudes SET token=$1, token_expira_at=$2, updated_at=NOW() WHERE id=$3',
                [nuevoToken, expira, id]
            );
            sol.token = nuevoToken;
        }

        await pool.query(
            'INSERT INTO hv_envios_link (solicitud_id,enviado_por,enviado_a,canal,mensaje) VALUES($1,$2,$3,$4,$5)',
            [id, user.id, enviado_a || null, canal, mensaje || null]
        );

        await cambiarEstado(id, 'link_enviado', user.id, user.name, getIp(req), `Reenviado a ${enviado_a}`);

        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5174';
        res.json({ link: `${baseUrl}/documentacion/${sol.token}` });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const aprobarDocumento = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const docId = req.params['docId'] as string;
    const { estado, obs_rechazo } = req.body; // 'aprobado' | 'rechazado'

    try {
        const prev = await pool.query('SELECT * FROM hv_documentos WHERE id=$1', [docId]);
        if (!prev.rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

        await pool.query(
            'UPDATE hv_documentos SET estado=$1, obs_rechazo=$2, aprobado_por=$3, aprobado_at=NOW() WHERE id=$4',
            [estado, obs_rechazo || null, estado === 'aprobado' ? user.id : null, docId]
        );

        await registrarAuditoria(prev.rows[0].solicitud_id, `doc_${estado}`, 'documento',
            docId, user.id, user.name, getIp(req),
            { estado: prev.rows[0].estado }, { estado, obs_rechazo });

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── DOCUMENTACIÓN FÍSICA ────────────────────────────────────────────────────

export const registrarDocFisica = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const id = req.params['id'] as string;
    const { estado, obs } = req.body;

    try {
        await pool.query(
            `UPDATE hv_solicitudes SET
             doc_fisica_estado=$1, doc_fisica_obs=$2,
             doc_fisica_recibida_por=$3, doc_fisica_fecha=NOW(), updated_at=NOW()
             WHERE id=$4`,
            [estado, obs || null, user.name, id]
        );
        await registrarAuditoria(id, 'doc_fisica', 'solicitud', id, user.id, user.name, getIp(req), null, { estado, obs });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── KPIs / DASHBOARD ────────────────────────────────────────────────────────

export const getDashboard = async (req: Request, res: Response) => {
    try {
        const [estados, tiempos, vencimientos, pendientes] = await Promise.all([
            // Conteo por estado
            pool.query(`
                SELECT estado, count(*) as total
                FROM hv_solicitudes GROUP BY estado ORDER BY total DESC
            `),
            // Tiempos promedio (segundos)
            pool.query(`
                SELECT
                    ROUND(AVG(EXTRACT(EPOCH FROM (primera_apertura_at - created_at))/3600),1) AS horas_creacion_apertura,
                    ROUND(AVG(EXTRACT(EPOCH FROM (enviada_at - primera_apertura_at))/3600),1) AS horas_diligenciamiento,
                    ROUND(AVG(EXTRACT(EPOCH FROM (aprobada_at - enviada_at))/3600),1) AS horas_aprobacion
                FROM hv_solicitudes
                WHERE aprobada_at IS NOT NULL
            `),
            // Documentos vencidos o próximos a vencer
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE fecha_vencimiento < CURRENT_DATE) AS vencidos,
                    COUNT(*) FILTER (WHERE fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE+30) AS vence_30d,
                    COUNT(*) FILTER (WHERE fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE+7) AS vence_7d
                FROM hv_documentos
                WHERE fecha_vencimiento IS NOT NULL AND estado='aprobado'
            `),
            // Solicitudes pendientes de aprobación
            pool.query(`
                SELECT s.id, s.nombre_entidad, s.tipo_entidad, s.created_at,
                       t.nombre as tipo_tercero,
                       EXTRACT(EPOCH FROM (NOW()-s.created_at))/3600 AS horas_pendiente
                FROM hv_solicitudes s
                LEFT JOIN hv_tipos_tercero t ON t.id=s.tipo_tercero_id
                WHERE s.estado='pendiente_aprobacion'
                ORDER BY s.created_at ASC
                LIMIT 10
            `),
        ]);

        // % completitud general
        const complRes = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado='completa') as completas,
                COUNT(*) FILTER (WHERE estado='aprobada') as aprobadas
            FROM hv_solicitudes
        `);

        const t = complRes.rows[0];
        const pct_completas = t.total > 0 ? Math.round(t.completas * 100 / t.total) : 0;
        const pct_aprobadas = t.total > 0 ? Math.round(t.aprobadas * 100 / t.total) : 0;

        res.json({
            por_estado: estados.rows,
            tiempos: tiempos.rows[0],
            vencimientos: vencimientos.rows[0],
            pendientes_revision: pendientes.rows,
            totales: { ...t, pct_completas, pct_aprobadas },
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const getAlertas = async (req: Request, res: Response) => {
    const { dias = 90 } = req.query;
    try {
        const { rows } = await pool.query(`
            SELECT d.*, s.nombre_entidad, s.tipo_entidad,
                   t.nombre as tipo_tercero,
                   (d.fecha_vencimiento - CURRENT_DATE) AS dias_restantes
            FROM hv_documentos d
            JOIN hv_solicitudes s ON s.id=d.solicitud_id
            LEFT JOIN hv_tipos_tercero t ON t.id=s.tipo_tercero_id
            WHERE d.fecha_vencimiento IS NOT NULL
              AND d.estado='aprobado'
              AND d.fecha_vencimiento <= CURRENT_DATE + $1::int
            ORDER BY d.fecha_vencimiento ASC
            LIMIT 200
        `, [Number(dias)]);
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── MAESTRAS PARAMETRIZABLES ────────────────────────────────────────────────

export const getMaestras = async (req: Request, res: Response) => {
    try {
        const [tipos, docs, campos] = await Promise.all([
            pool.query('SELECT * FROM hv_tipos_tercero ORDER BY orden'),
            pool.query(`
                SELECT d.*, t.nombre as tipo_tercero_nombre
                FROM hv_tipos_documento_req d
                LEFT JOIN hv_tipos_tercero t ON t.id=d.tipo_tercero_id
                ORDER BY d.tipo_entidad, d.tipo_tercero_id, d.orden
            `),
            pool.query(`
                SELECT c.*, t.nombre as tipo_tercero_nombre
                FROM hv_campos_formulario c
                LEFT JOIN hv_tipos_tercero t ON t.id=c.tipo_tercero_id
                ORDER BY c.tipo_entidad, c.tipo_tercero_id, c.orden
            `),
        ]);
        res.json({ tipos_tercero: tipos.rows, tipos_documento: docs.rows, campos_formulario: campos.rows });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const upsertTipoDocumento = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const body = req.body;
    try {
        if (body.id) {
            await pool.query(
                `UPDATE hv_tipos_documento_req SET
                 nombre=$1,nombre_archivo=$2,descripcion=$3,obligatorio=$4,
                 acepta_vencimiento=$5,dias_alerta_1=$6,dias_alerta_2=$7,
                 dias_alerta_3=$8,dias_alerta_4=$9,orden=$10,activo=$11
                 WHERE id=$12`,
                [body.nombre,body.nombre_archivo,body.descripcion,body.obligatorio,
                 body.acepta_vencimiento,body.dias_alerta_1,body.dias_alerta_2,
                 body.dias_alerta_3,body.dias_alerta_4,body.orden,body.activo,body.id]
            );
        } else {
            await pool.query(
                `INSERT INTO hv_tipos_documento_req
                 (tipo_entidad,tipo_tercero_id,nombre,nombre_archivo,descripcion,
                  obligatorio,acepta_vencimiento,dias_alerta_1,dias_alerta_2,dias_alerta_3,dias_alerta_4,orden)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [body.tipo_entidad,body.tipo_tercero_id,body.nombre,body.nombre_archivo,
                 body.descripcion,body.obligatorio,body.acepta_vencimiento,
                 body.dias_alerta_1||90,body.dias_alerta_2||30,body.dias_alerta_3||15,body.dias_alerta_4||7,body.orden||0]
            );
        }
        await registrarAuditoria(null,'upsert_tipo_doc','tipo_documento',body.id||null,user.id,user.name,getIp(req));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── SERVIR ARCHIVOS LOCALES ─────────────────────────────────────────────────

export const serveLocalFile = async (req: Request, res: Response) => {
    const filePath = (req.query['p'] as string) || '';
    const localPath = path.join(LOCAL_BASE, decodeURIComponent(filePath));
    if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(localPath).pipe(res);
};

// ─── HISTORIAL / AUDITORÍA ───────────────────────────────────────────────────

export const getAuditoria = async (req: Request, res: Response) => {
    const { solicitud_id, limit = 50 } = req.query;
    try {
        const { rows } = await pool.query(
            `SELECT * FROM hv_auditoria WHERE solicitud_id=$1 ORDER BY created_at DESC LIMIT $2`,
            [solicitud_id, Number(limit)]
        );
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

// ─── ENDPOINT PÚBLICO (token) ─────────────────────────────────────────────────

export const getPublicSolicitud = async (req: Request, res: Response) => {
    const token = req.params['token'] as string;
    const ip = getIp(req);
    const ua = req.headers['user-agent'] || '';

    try {
        const { rows } = await pool.query(
            `SELECT s.*, t.nombre as tipo_tercero_nombre, t.codigo as tipo_tercero_codigo
             FROM hv_solicitudes s
             LEFT JOIN hv_tipos_tercero t ON t.id=s.tipo_tercero_id
             WHERE s.token=$1`, [token]
        );
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada o link inválido' });

        const sol = rows[0];
        if (new Date(sol.token_expira_at) < new Date()) {
            return res.status(410).json({ error: 'Este link ha expirado. Solicite un nuevo link al área de operaciones.' });
        }
        if (sol.estado === 'aprobada' || sol.estado === 'completa') {
            return res.status(409).json({ error: 'Esta solicitud ya fue completada y aprobada.' });
        }

        // Registrar acceso
        const acceso = await pool.query(
            `INSERT INTO hv_accesos_link (solicitud_id,ip,user_agent,dispositivo) VALUES($1,$2,$3,$4) RETURNING id`,
            [sol.id, ip, ua, detectDevice(ua)]
        );
        await pool.query(
            `UPDATE hv_solicitudes SET
             veces_abierto = veces_abierto+1,
             primera_apertura_at = COALESCE(primera_apertura_at, NOW()),
             ultima_apertura_at = NOW(),
             estado = CASE WHEN estado='link_enviado' OR estado='creada' THEN 'abierta' ELSE estado END
             WHERE id=$1`, [sol.id]
        );

        // Obtener catálogos relevantes
        const [campos, docsReq, docsExistentes] = await Promise.all([
            pool.query(
                `SELECT * FROM hv_campos_formulario
                 WHERE activo=TRUE AND tipo_entidad=$1
                   AND (tipo_tercero_id=$2 OR tipo_tercero_id IS NULL)
                 ORDER BY orden`,
                [sol.tipo_entidad, sol.tipo_tercero_id]
            ),
            pool.query(
                `SELECT * FROM hv_tipos_documento_req
                 WHERE activo=TRUE AND tipo_entidad=$1
                   AND (tipo_tercero_id=$2 OR tipo_tercero_id IS NULL)
                 ORDER BY orden`,
                [sol.tipo_entidad, sol.tipo_tercero_id]
            ),
            pool.query('SELECT * FROM hv_documentos WHERE solicitud_id=$1', [sol.id]),
        ]);

        res.json({
            solicitud: {
                id: sol.id,
                tipo_entidad: sol.tipo_entidad,
                tipo_tercero: sol.tipo_tercero_nombre,
                tipo_tercero_codigo: sol.tipo_tercero_codigo,
                nombre_entidad: sol.nombre_entidad,
                estado: sol.estado,
                datos_json: sol.datos_json,
                token_expira_at: sol.token_expira_at,
            },
            campos_formulario: campos.rows,
            documentos_requeridos: docsReq.rows,
            documentos_subidos: docsExistentes.rows,
            acceso_id: acceso.rows[0].id,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const guardarDatosPublico = async (req: Request, res: Response) => {
    const token = req.params['token'] as string;
    const { datos, acceso_id } = req.body;

    try {
        const { rows } = await pool.query(
            'SELECT id, estado, token_expira_at FROM hv_solicitudes WHERE token=$1', [token]
        );
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (new Date(rows[0].token_expira_at) < new Date()) {
            return res.status(410).json({ error: 'Link expirado' });
        }

        const solId = rows[0].id;
        await pool.query(
            `UPDATE hv_solicitudes SET
             datos_json = datos_json || $1::jsonb,
             estado = CASE WHEN estado IN ('abierta','link_enviado','creada') THEN 'en_diligenciamiento' ELSE estado END,
             updated_at = NOW()
             WHERE id=$2`,
            [JSON.stringify(datos), solId]
        );

        if (acceso_id) {
            await pool.query('UPDATE hv_accesos_link SET fin_at=NOW() WHERE id=$1', [acceso_id]);
        }

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const subirDocumentoPublico = async (req: Request, res: Response) => {
    const token = req.params['token'] as string;
    const ip = getIp(req);

    try {
        const { rows } = await pool.query(
            'SELECT * FROM hv_solicitudes WHERE token=$1', [token]
        );
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (new Date(rows[0].token_expira_at) < new Date()) {
            return res.status(410).json({ error: 'Link expirado' });
        }

        const sol = rows[0];
        const file = (req as any).file;
        if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

        const { tipo_doc_req_id, nombre_doc, nombre_archivo, fecha_vencimiento } = req.body;

        // Validar
        const validation = validateUpload(file.buffer, file.mimetype, file.originalname);
        if (!validation.valid) return res.status(400).json({ error: validation.error });

        // Convertir a PDF
        const converted = await convertToPdf(file.buffer, file.originalname, file.mimetype);

        // Nombre final: siempre .pdf
        const nombreFinal = nombre_archivo
            ? nombre_archivo.replace(/\.[^.]+$/, '') + '.pdf'
            : file.originalname.replace(/\.[^.]+$/, '') + '.pdf';

        // Obtener tipo_tercero para la ruta
        let tipoTerceroCodigo: string | null = null;
        if (sol.tipo_tercero_id) {
            const ttRes = await pool.query('SELECT codigo FROM hv_tipos_tercero WHERE id=$1', [sol.tipo_tercero_id]);
            tipoTerceroCodigo = ttRes.rows[0]?.codigo || null;
        }

        // Subir a Drive
        const identificador = sol.nombre_entidad || sol.id;
        const { drivePath, driveLink } = await uploadDocument(
            converted.buffer,
            sol.tipo_entidad,
            tipoTerceroCodigo,
            identificador,
            nombreFinal
        );

        // ¿Ya existe un doc de este tipo? → versionar
        const existente = await pool.query(
            'SELECT * FROM hv_documentos WHERE solicitud_id=$1 AND tipo_doc_req_id=$2',
            [sol.id, tipo_doc_req_id || null]
        );

        let docId: number;
        if (existente.rows.length) {
            const prev = existente.rows[0];
            // Guardar versión anterior
            await pool.query(
                `INSERT INTO hv_documentos_versiones
                 (documento_id,version,drive_path_ant,drive_link_ant,nombre_archivo_ant,fecha_vencimiento_ant,motivo)
                 VALUES($1,$2,$3,$4,$5,$6,'Reemplazado desde formulario público')`,
                [prev.id, prev.version, prev.drive_path, prev.drive_link, prev.nombre_archivo, prev.fecha_vencimiento]
            );
            await pool.query(
                `UPDATE hv_documentos SET
                 drive_path=$1,drive_link=$2,nombre_archivo=$3,version=version+1,
                 fecha_vencimiento=$4,estado='pendiente',obs_rechazo=NULL,
                 subido_at=NOW(),subido_ip=$5,tamanio_bytes=$6,mime_original=$7
                 WHERE id=$8`,
                [drivePath, driveLink, nombreFinal, fecha_vencimiento || null,
                 ip, converted.buffer.length, file.mimetype, prev.id]
            );
            docId = prev.id;
        } else {
            const ins = await pool.query(
                `INSERT INTO hv_documentos
                 (solicitud_id,tipo_doc_req_id,nombre_doc,nombre_archivo,mime_original,
                  drive_path,drive_link,fecha_vencimiento,subido_ip,tamanio_bytes)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
                [sol.id, tipo_doc_req_id || null, nombre_doc || nombreFinal,
                 nombreFinal, file.mimetype, drivePath, driveLink,
                 fecha_vencimiento || null, ip, converted.buffer.length]
            );
            docId = ins.rows[0].id;
        }

        await registrarAuditoria(sol.id, 'upload_doc', 'documento', String(docId),
            null, 'Formulario público', ip, null, { nombre_doc, nombreFinal, drivePath });

        res.json({ success: true, documento_id: docId, drive_link: driveLink, nombre_archivo: nombreFinal });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const submitFormularioPublico = async (req: Request, res: Response) => {
    const token = req.params['token'] as string;
    const { acceso_id } = req.body;

    try {
        const { rows } = await pool.query(
            'SELECT * FROM hv_solicitudes WHERE token=$1', [token]
        );
        if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (new Date(rows[0].token_expira_at) < new Date()) {
            return res.status(410).json({ error: 'Link expirado' });
        }

        const sol = rows[0];
        await cambiarEstado(sol.id, 'pendiente_aprobacion', null, 'Formulario público', getIp(req),
            'Formulario enviado por el proveedor/conductor');

        if (acceso_id) {
            await pool.query(
                'UPDATE hv_accesos_link SET fin_at=NOW(), completado=TRUE WHERE id=$1', [acceso_id]
            );
        }

        await registrarAuditoria(sol.id, 'submit', 'solicitud', sol.id,
            null, 'Formulario público', getIp(req));

        res.json({ success: true, message: 'Información enviada correctamente. Un funcionario revisará sus documentos.' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};
