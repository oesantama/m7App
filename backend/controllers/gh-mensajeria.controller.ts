import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest, userHasPermission } from '../middleware/auth.middleware.js';
import {
    validateUpload, saveToQueue, triggerUpload, streamStoredFile, rutaArchivoEnvio, ValidatedFile,
} from '../services/gh-storage.service.js';
import {
    EstadoEnvio, TipoArchivoEnvio, esEstadoValido, validarTransicion, generarTracking,
    enmascararDocumento, ESTADOS_ABIERTOS, TRANSICIONES_MENSAJERO, HORAS_ALERTA_ATRASO,
    ESTADO_ID as ID, estadoDesdeId, idsSql,
} from '../services/gh-mensajeria.logic.js';
import { notificarCambioEstado } from '../services/gh-mensajeria-alertas.service.js';

const MAX_FIRMA_BYTES = 512 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actor = (req: AuthRequest) => ({
    id: String(req.user?.id || 'SYSTEM'),
    name: String(req.user?.name || req.user?.email || 'SYSTEM'),
});
const str = (v: any, max = 500): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};
const num = (v: any): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const intId = (v: any): number | null => {
    const n = num(v);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
};
const coord = (v: any, lim: number): number | null => {
    const n = num(v);
    return n !== null && Math.abs(n) <= lim ? n : null;
};
const clientIp = (req: AuthRequest) =>
    String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64);

const isAdmin = (req: AuthRequest, action = 'view') => userHasPermission(req.user, 'MENSAJERIA_GH', action);

/** gh_personal.id del usuario autenticado (enlazado por cédula = users.document_number). */
async function personalIdDelUsuario(userId: string): Promise<number | null> {
    const { rows } = await pool.query(`
        SELECT p.id FROM users u
        JOIN gh_personal p ON TRIM(p.cedula) = TRIM(u.document_number)
        WHERE u.id = $1 AND COALESCE(u.document_number, '') <> ''
        LIMIT 1`, [userId]);
    return rows[0]?.id ?? null;
}

const ABIERTOS = idsSql(ESTADOS_ABIERTOS);
const SQL_ATRASADO = `(e.estado_id IN (${ABIERTOS}) AND e.created_at <= NOW() - make_interval(hours => ${HORAS_ALERTA_ATRASO}))`;

const SELECT_ENVIO = `
    SELECT e.*, es.name AS estado_nombre, r.nombre AS remitente_nombre, r.cedula AS remitente_cedula,
           m.nombre AS mensajero_nombre, ${SQL_ATRASADO} AS atrasado
    FROM gh_mensajeria_envios e
    JOIN estados es ON es.id = e.estado_id
    JOIN gh_personal r ON r.id = e.remitente_id
    LEFT JOIN gh_personal m ON m.id = e.mensajero_id`;

/** Añade el código de estado (PENDIENTE, EN_CAMINO…) a partir del ID de la maestra. */
const conEstado = <T extends { estado_id?: string }>(r: T) => ({ ...r, estado: estadoDesdeId(r.estado_id) });

async function cargarDetalle(envioId: number) {
    const env = await pool.query(`${SELECT_ENVIO} WHERE e.id = $1`, [envioId]);
    if (!env.rows.length) return null;
    const [eventos, archivos] = await Promise.all([
        pool.query(`
            SELECT id, estado_anterior_id, estado_nuevo_id, motivo, lat, lng, user_name, created_at, capturado_at
            FROM gh_mensajeria_eventos WHERE envio_id = $1 ORDER BY created_at, id`, [envioId]),
        pool.query(`
            SELECT id, evento_id, tipo, firmante_nombre, firmante_documento, mime, tamano_bytes, sha256,
                   estado_subida, lat, lng, created_at
            FROM gh_mensajeria_archivos WHERE envio_id = $1 ORDER BY id`, [envioId]),
    ]);
    return {
        ...conEstado(env.rows[0]),
        eventos: eventos.rows.map(ev => ({
            ...ev,
            estado_anterior: estadoDesdeId(ev.estado_anterior_id),
            estado_nuevo: estadoDesdeId(ev.estado_nuevo_id),
        })),
        archivos: archivos.rows,
    };
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

/** Mensajeros = usuarios activos con perfil MENSAJERO (ROL-04) enlazados a gh_personal por cédula. */
export const getMensajeros = async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.id, p.nombre, p.cedula,
                   COALESCE(NULLIF(p.celular_corporativo,''), p.celular_personal) AS telefono,
                   (SELECT COUNT(*)::int FROM gh_mensajeria_envios e
                     WHERE e.mensajero_id = p.id AND e.estado_id IN ('${ID.ASIGNADO}','${ID.EN_CAMINO}')) AS envios_activos
            FROM users u
            JOIN gh_personal p ON TRIM(p.cedula) = TRIM(u.document_number)
            WHERE u.role_id = 'ROL-04' AND COALESCE(u.status_id, 'EST-01') IN ('EST-01', 'ACTIVO')
            ORDER BY p.nombre`);
        res.json(rows);
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getMensajeros:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar mensajeros' });
    }
};

// ── Panel administrativo ──────────────────────────────────────────────────────

export const listEnvios = async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, intId(req.query.page) || 1);
    const pageSize = Math.min(100, intId(req.query.pageSize) || 20);
    const where: string[] = ['TRUE'];
    const params: any[] = [];

    const estado = str(req.query.estado, 20);
    if (estado === 'ABIERTOS') where.push(`e.estado_id IN (${ABIERTOS})`);
    else if (estado && esEstadoValido(estado)) { params.push(ID[estado]); where.push(`e.estado_id = $${params.length}`); }
    const mensajeroId = intId(req.query.mensajero_id);
    if (mensajeroId) { params.push(mensajeroId); where.push(`e.mensajero_id = $${params.length}`); }
    const remitenteId = intId(req.query.remitente_id);
    if (remitenteId) { params.push(remitenteId); where.push(`e.remitente_id = $${params.length}`); }
    const desde = str(req.query.desde, 10);
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) { params.push(desde); where.push(`e.created_at >= $${params.length}::date`); }
    const hasta = str(req.query.hasta, 10);
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) { params.push(hasta); where.push(`e.created_at < $${params.length}::date + 1`); }
    if (req.query.atrasados === 'true') {
        where.push(SQL_ATRASADO);
    }
    const q = str(req.query.q, 100);
    if (q) {
        params.push(`%${q}%`);
        const i = params.length;
        where.push(`(e.tracking ILIKE $${i} OR e.destinatario_nombre ILIKE $${i} OR e.destinatario_empresa ILIKE $${i}
                     OR e.contenido ILIKE $${i} OR r.nombre ILIKE $${i} OR m.nombre ILIKE $${i})`);
    }

    try {
        const whereSql = `WHERE ${where.join(' AND ')}`;
        const joins = `FROM gh_mensajeria_envios e JOIN gh_personal r ON r.id = e.remitente_id LEFT JOIN gh_personal m ON m.id = e.mensajero_id`;
        const count = await pool.query(`SELECT COUNT(*)::int AS total ${joins} ${whereSql}`, params);
        params.push(pageSize, (page - 1) * pageSize);
        const { rows } = await pool.query(`
            ${SELECT_ENVIO} ${whereSql}
            ORDER BY e.created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        // El documento del destinatario no viaja completo en listados
        const data = rows.map(r => ({
            ...conEstado(r),
            destinatario_documento: enmascararDocumento(r.destinatario_documento),
            receptor_documento: enmascararDocumento(r.receptor_documento),
            remitente_cedula: undefined,
        }));
        res.json({ data, total: count.rows[0].total, page, pageSize });
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] listEnvios:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar envíos' });
    }
};

export const getDashboard = async (_req: AuthRequest, res: Response) => {
    try {
        const [resumen, porMensajero, alertas] = await Promise.all([
            pool.query(`
                SELECT
                  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS creados_hoy,
                  COUNT(*) FILTER (WHERE fecha_entrega_real >= CURRENT_DATE)::int AS entregados_hoy,
                  COUNT(*) FILTER (WHERE estado_id = '${ID.PENDIENTE}')::int AS pendientes,
                  COUNT(*) FILTER (WHERE estado_id = '${ID.ASIGNADO}')::int AS asignados,
                  COUNT(*) FILTER (WHERE estado_id = '${ID.EN_CAMINO}')::int AS en_camino,
                  COUNT(*) FILTER (WHERE estado_id = '${ID.FALLIDO}')::int AS fallidos,
                  COUNT(*) FILTER (WHERE ${SQL_ATRASADO})::int AS atrasados,
                  ROUND(AVG(EXTRACT(EPOCH FROM (fecha_entrega_real - created_at)) / 3600)
                        FILTER (WHERE estado_id = '${ID.ENTREGADO}' AND fecha_entrega_real >= CURRENT_DATE - 30)::numeric, 1) AS horas_promedio_30d
                FROM gh_mensajeria_envios e`),
            pool.query(`
                SELECT m.id, m.nombre,
                       COUNT(*) FILTER (WHERE e.estado_id IN ('${ID.ASIGNADO}','${ID.EN_CAMINO}'))::int AS activos,
                       COUNT(*) FILTER (WHERE e.fecha_entrega_real >= CURRENT_DATE)::int AS entregados_hoy
                FROM gh_mensajeria_envios e JOIN gh_personal m ON m.id = e.mensajero_id
                WHERE e.estado_id IN ('${ID.ASIGNADO}','${ID.EN_CAMINO}') OR e.fecha_entrega_real >= CURRENT_DATE
                GROUP BY m.id, m.nombre ORDER BY activos DESC`),
            pool.query(`SELECT COUNT(*)::int AS abiertas FROM gh_mensajeria_alertas WHERE resuelta = FALSE`),
        ]);
        res.json({ resumen: resumen.rows[0], porMensajero: porMensajero.rows, alertasAbiertas: alertas.rows[0].abiertas });
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getDashboard:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar el dashboard' });
    }
};

export const getAlertas = async (_req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(`
            SELECT a.id, a.tipo, a.detalle, a.generada_at, a.notificada,
                   e.id AS envio_id, e.tracking, e.estado_id, e.destinatario_nombre, e.destinatario_ciudad,
                   e.created_at AS envio_creado, r.nombre AS remitente_nombre, m.nombre AS mensajero_nombre
            FROM gh_mensajeria_alertas a
            JOIN gh_mensajeria_envios e ON e.id = a.envio_id
            JOIN gh_personal r ON r.id = e.remitente_id
            LEFT JOIN gh_personal m ON m.id = e.mensajero_id
            WHERE a.resuelta = FALSE
            ORDER BY a.generada_at`);
        res.json(rows.map(conEstado));
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getAlertas:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar alertas' });
    }
};

export const getEnvio = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const det = await cargarDetalle(id);
        if (!det) return res.status(404).json({ success: false, error: 'Envío no encontrado' });
        res.json(det);
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getEnvio:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar el envío' });
    }
};

export const createEnvio = async (req: AuthRequest, res: Response) => {
    const b = req.body || {};
    const data = {
        remitente_id: intId(b.remitente_id),
        tipo: str(b.tipo, 20) || 'DOCUMENTO',
        contenido: str(b.contenido, 2000),
        cantidad: intId(b.cantidad) || 1,
        peso_kg: num(b.peso_kg),
        valor_declarado: num(b.valor_declarado),
        prioridad: str(b.prioridad, 10) || 'NORMAL',
        destinatario_nombre: str(b.destinatario_nombre, 200),
        destinatario_documento: str(b.destinatario_documento, 30),
        destinatario_telefono: str(b.destinatario_telefono, 30),
        destinatario_direccion: str(b.destinatario_direccion, 300),
        destinatario_ciudad: str(b.destinatario_ciudad, 100),
        destinatario_empresa: str(b.destinatario_empresa, 200),
        fecha_entrega_estimada: str(b.fecha_entrega_estimada, 30),
        observaciones: str(b.observaciones, 2000),
        mensajero_id: intId(b.mensajero_id),
    };
    if (!data.remitente_id) return res.status(400).json({ success: false, error: 'El remitente es obligatorio.' });
    if (!['DOCUMENTO', 'PAQUETE', 'ENCOMIENDA'].includes(data.tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido.' });
    if (!['NORMAL', 'URGENTE'].includes(data.prioridad)) return res.status(400).json({ success: false, error: 'Prioridad inválida.' });
    if (!data.contenido) return res.status(400).json({ success: false, error: 'Describa el contenido del envío.' });
    if (!data.destinatario_nombre) return res.status(400).json({ success: false, error: 'El nombre del destinatario es obligatorio.' });
    if (!data.destinatario_direccion || !data.destinatario_ciudad) return res.status(400).json({ success: false, error: 'La dirección y ciudad del destinatario son obligatorias.' });
    if ((data.peso_kg ?? 0) < 0 || (data.valor_declarado ?? 0) < 0) return res.status(400).json({ success: false, error: 'Peso y valor no pueden ser negativos.' });
    if (data.destinatario_telefono && data.destinatario_telefono.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ success: false, error: 'Teléfono del destinatario inválido.' });
    }
    const fechaEst = data.fecha_entrega_estimada && !isNaN(Date.parse(data.fecha_entrega_estimada)) ? data.fecha_entrega_estimada : null;

    const who = actor(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Serializa la generación del consecutivo diario del tracking
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('gh_mensajeria_tracking'))`);
        // Consecutivo = mayor número ya usado con el prefijo del día (no un conteo por fecha,
        // que se descuadra si cambia un created_at o en el borde de medianoche)
        const ahoraBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
        const prefijo = generarTracking(ahoraBogota, 0).slice(0, -4);
        const ult = await client.query(`
            SELECT COALESCE(MAX(NULLIF(split_part(tracking, '-', 3), '')::int), 0) AS n
            FROM gh_mensajeria_envios WHERE tracking LIKE $1`, [`${prefijo}%`]);
        const tracking = generarTracking(ahoraBogota, ult.rows[0].n + 1);

        const estado: EstadoEnvio = data.mensajero_id ? 'ASIGNADO' : 'PENDIENTE';
        const ins = await client.query(`
            INSERT INTO gh_mensajeria_envios (tracking, remitente_id, tipo, contenido, cantidad, peso_kg, valor_declarado,
                prioridad, destinatario_nombre, destinatario_documento, destinatario_telefono, destinatario_direccion,
                destinatario_ciudad, destinatario_empresa, mensajero_id, estado_id, fecha_entrega_estimada,
                fecha_asignacion, observaciones, created_by, created_by_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                    CASE WHEN $15::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, $18,$19,$20)
            RETURNING id`,
            [tracking, data.remitente_id, data.tipo, data.contenido, data.cantidad, data.peso_kg, data.valor_declarado,
             data.prioridad, data.destinatario_nombre, data.destinatario_documento, data.destinatario_telefono,
             data.destinatario_direccion, data.destinatario_ciudad, data.destinatario_empresa, data.mensajero_id,
             ID[estado], fechaEst, data.observaciones, who.id, who.name]);
        const id = ins.rows[0].id;
        await client.query(`
            INSERT INTO gh_mensajeria_eventos (envio_id, estado_anterior_id, estado_nuevo_id, motivo, ip, user_id, user_name)
            VALUES ($1, NULL, $2, 'Envío creado', $3, $4, $5)`, [id, ID[estado], clientIp(req), who.id, who.name]);
        await client.query('COMMIT');
        if (estado === 'ASIGNADO') notificarCambioEstado(id, 'ASIGNADO');
        res.json({ success: true, data: { id, tracking } });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[GH-MENSAJERIA] createEnvio:', err.message);
        res.status(500).json({ success: false, error: 'Error al crear el envío' });
    } finally {
        client.release();
    }
};

/**
 * Cambios de estado desde el panel: asignar/reasignar (ASIGNADO), volver a PENDIENTE,
 * CANCELADO, DEVUELTO o reintentar un FALLIDO (→ ASIGNADO). Recoger/entregar/incidencia
 * son exclusivos del mensajero porque requieren firmas y fotos.
 */
export const cambiarEstadoAdmin = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    const hacia = str(req.body.estado, 20);
    const motivo = str(req.body.motivo, 1000);
    const mensajeroId = intId(req.body.mensajero_id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    if (!hacia || !esEstadoValido(hacia)) return res.status(400).json({ success: false, error: 'Estado inválido.' });
    if (TRANSICIONES_MENSAJERO.includes(hacia)) {
        return res.status(400).json({ success: false, error: 'Ese cambio lo registra el mensajero desde su celular con firma y foto.' });
    }

    const who = actor(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT estado_id, mensajero_id FROM gh_mensajeria_envios WHERE id = $1 FOR UPDATE`, [id]);
        if (!cur.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Envío no encontrado' });
        }
        const desde = estadoDesdeId(cur.rows[0].estado_id) as EstadoEnvio;
        const v = validarTransicion({ desde, hacia, motivo, mensajeroId: mensajeroId ?? cur.rows[0].mensajero_id, evidencias: [] });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: v.error });
        }
        if (hacia === 'ASIGNADO' && mensajeroId) {
            const ok = await client.query(`
                SELECT 1 FROM users u JOIN gh_personal p ON TRIM(p.cedula) = TRIM(u.document_number)
                WHERE p.id = $1 AND u.role_id = 'ROL-04'`, [mensajeroId]);
            if (!ok.rows.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: 'La persona seleccionada no tiene perfil MENSAJERO.' });
            }
        }

        await client.query(`
            UPDATE gh_mensajeria_envios SET
                estado_id = $2::text,
                mensajero_id = CASE WHEN $2::text = '${ID.ASIGNADO}' THEN COALESCE($3::int, mensajero_id)
                                    WHEN $2::text = '${ID.PENDIENTE}' THEN NULL ELSE mensajero_id END,
                fecha_asignacion = CASE WHEN $2::text = '${ID.ASIGNADO}' THEN CURRENT_TIMESTAMP ELSE fecha_asignacion END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`, [id, ID[hacia], mensajeroId]);
        await client.query(`
            INSERT INTO gh_mensajeria_eventos (envio_id, estado_anterior_id, estado_nuevo_id, motivo, ip, user_agent, user_id, user_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, ID[desde], ID[hacia], motivo || (hacia === 'ASIGNADO' ? 'Mensajero asignado' : null), clientIp(req),
             str(req.headers['user-agent'], 300), who.id, who.name]);
        await client.query('COMMIT');
        if (hacia === 'ASIGNADO') notificarCambioEstado(id, 'ASIGNADO');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[GH-MENSAJERIA] cambiarEstadoAdmin:', err.message);
        res.status(500).json({ success: false, error: 'Error al cambiar el estado' });
    } finally {
        client.release();
    }
};

// ── Vista del mensajero ───────────────────────────────────────────────────────

export const getMisEnvios = async (req: AuthRequest, res: Response) => {
    try {
        const pid = await personalIdDelUsuario(actor(req).id);
        if (!pid) return res.status(403).json({ success: false, error: 'Tu usuario no está enlazado a un colaborador de Gestión Humana (cédula).' });
        const { rows } = await pool.query(`
            ${SELECT_ENVIO}
            WHERE e.mensajero_id = $1
              AND (e.estado_id IN ('${ID.ASIGNADO}','${ID.EN_CAMINO}','${ID.FALLIDO}') OR e.updated_at >= CURRENT_DATE)
            ORDER BY CASE e.estado_id WHEN '${ID.EN_CAMINO}' THEN 0 WHEN '${ID.ASIGNADO}' THEN 1 WHEN '${ID.FALLIDO}' THEN 2 ELSE 3 END,
                     e.prioridad DESC, e.created_at`, [pid]);
        res.json(rows.map(r => ({ ...conEstado(r), remitente_cedula: undefined })));
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getMisEnvios:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar tus envíos' });
    }
};

export const getMiEnvio = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const pid = await personalIdDelUsuario(actor(req).id);
        const det = await cargarDetalle(id);
        if (!det || !pid || det.mensajero_id !== pid) return res.status(404).json({ success: false, error: 'Envío no encontrado' });
        res.json({ ...det, remitente_cedula: undefined });
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getMiEnvio:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar el envío' });
    }
};

type Accion = 'recoger' | 'entregar' | 'incidencia';
const ACCION_ESTADO: Record<Accion, EstadoEnvio> = { recoger: 'EN_CAMINO', entregar: 'ENTREGADO', incidencia: 'FALLIDO' };

/**
 * Acción del mensajero con evidencias (multipart):
 *   recoger    → firma (PNG, firma del mensajero) + foto (paquete)                → EN_CAMINO
 *   entregar   → firma (PNG, firma del destinatario) + foto (entrega) + receptor  → ENTREGADO
 *   incidencia → foto + motivo                                                    → FALLIDO
 * `client_uuid` hace la operación idempotente: si la app offline reenvía la misma acción,
 * se responde éxito sin duplicar el evento.
 */
export const accionMensajero = (accion: Accion) => async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    const hacia = ACCION_ESTADO[accion];
    const b = req.body || {};
    const clientUuid = str(b.client_uuid, 36);
    if (clientUuid && !UUID_RE.test(clientUuid)) return res.status(400).json({ success: false, error: 'client_uuid inválido' });
    const motivo = str(b.motivo, 1000);
    const receptorNombre = str(b.receptor_nombre, 200);
    const receptorDocumento = str(b.receptor_documento, 30);
    const lat = coord(b.lat, 90), lng = coord(b.lng, 180), precision = num(b.precision);
    const capturadoMs = Date.parse(String(b.capturado_at || ''));
    // Hora en que se capturó en el celular (offline); se guarda aparte de la hora del servidor
    const capturadoAt = Number.isFinite(capturadoMs) && capturadoMs <= Date.now() + 5 * 60_000 ? new Date(capturadoMs) : null;

    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const firma = files.firma?.[0];
    const foto = files.foto?.[0];

    let firmaInfo: ValidatedFile | null = null, fotoInfo: ValidatedFile | null = null;
    try {
        if (firma) {
            firmaInfo = validateUpload(firma.buffer, ['png']);
            if (firmaInfo.size > MAX_FIRMA_BYTES) throw new Error('La firma es demasiado grande.');
        }
        if (foto) fotoInfo = validateUpload(foto.buffer, ['image']);
    } catch (e: any) {
        return res.status(400).json({ success: false, error: e.message });
    }

    const tipoFirma: TipoArchivoEnvio = accion === 'recoger' ? 'FIRMA_MENSAJERO' : 'FIRMA_DESTINATARIO';
    const tipoFoto: TipoArchivoEnvio = accion === 'recoger' ? 'FOTO_PAQUETE' : accion === 'entregar' ? 'FOTO_ENTREGA' : 'FOTO_INCIDENCIA';
    const evidencias: TipoArchivoEnvio[] = [];
    if (firmaInfo && accion !== 'incidencia') evidencias.push(tipoFirma);
    if (fotoInfo) evidencias.push(tipoFoto);

    const who = actor(req);
    const client = await pool.connect();
    try {
        if (clientUuid) {
            const dup = await client.query(`SELECT envio_id FROM gh_mensajeria_eventos WHERE client_uuid = $1`, [clientUuid]);
            if (dup.rows.length) return res.json({ success: true, duplicado: true });
        }
        const pid = await personalIdDelUsuario(who.id);
        if (!pid) return res.status(403).json({ success: false, error: 'Tu usuario no está enlazado a un colaborador de Gestión Humana.' });

        await client.query('BEGIN');
        const cur = await client.query(`
            SELECT e.estado_id, e.mensajero_id, e.tracking, e.created_at, e.destinatario_nombre,
                   p.nombre AS mensajero_nombre, p.cedula AS mensajero_cedula
            FROM gh_mensajeria_envios e LEFT JOIN gh_personal p ON p.id = e.mensajero_id
            WHERE e.id = $1 FOR UPDATE OF e`, [id]);
        if (!cur.rows.length || cur.rows[0].mensajero_id !== pid) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Envío no encontrado' });
        }
        const env = cur.rows[0];
        const desde = estadoDesdeId(env.estado_id) as EstadoEnvio;
        const v = validarTransicion({ desde, hacia, motivo, mensajeroId: pid, evidencias, receptorNombre });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: v.error });
        }

        const ev = await client.query(`
            INSERT INTO gh_mensajeria_eventos (envio_id, estado_anterior_id, estado_nuevo_id, motivo, lat, lng, precision_m,
                ip, user_agent, client_uuid, capturado_at, user_id, user_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [id, ID[desde], ID[hacia], motivo, lat, lng, precision, clientIp(req), str(req.headers['user-agent'], 300),
             clientUuid, capturadoAt, who.id, who.name]);
        const eventoId = ev.rows[0].id;

        const guardar = async (f: Express.Multer.File, info: ValidatedFile, tipo: TipoArchivoEnvio,
                               firmanteNombre: string | null, firmanteDoc: string | null) => {
            const localPath = saveToQueue(f.buffer, info.ext);
            const drivePath = rutaArchivoEnvio({
                creado: new Date(env.created_at), tracking: env.tracking, destinatario: env.destinatario_nombre,
                tipo, eventoId, ext: info.ext,
            });
            await client.query(`
                INSERT INTO gh_mensajeria_archivos (envio_id, evento_id, tipo, firmante_nombre, firmante_documento, mime,
                    tamano_bytes, sha256, drive_path, local_path, lat, lng, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [id, eventoId, tipo, firmanteNombre, firmanteDoc, info.mime, info.size, info.sha256,
                 drivePath, localPath, lat, lng, who.id]);
        };
        if (firma && firmaInfo && accion !== 'incidencia') {
            const [fn, fd] = accion === 'recoger'
                ? [env.mensajero_nombre, env.mensajero_cedula]
                : [receptorNombre, receptorDocumento];
            await guardar(firma, firmaInfo, tipoFirma, fn, fd);
        }
        if (foto && fotoInfo) await guardar(foto, fotoInfo, tipoFoto, null, null);

        await client.query(`
            UPDATE gh_mensajeria_envios SET
                estado_id = $2::text,
                fecha_recogida = CASE WHEN $2::text = '${ID.EN_CAMINO}' THEN CURRENT_TIMESTAMP ELSE fecha_recogida END,
                fecha_entrega_real = CASE WHEN $2::text = '${ID.ENTREGADO}' THEN CURRENT_TIMESTAMP ELSE fecha_entrega_real END,
                receptor_nombre = CASE WHEN $2::text = '${ID.ENTREGADO}' THEN $3::varchar ELSE receptor_nombre END,
                receptor_documento = CASE WHEN $2::text = '${ID.ENTREGADO}' THEN $4::varchar ELSE receptor_documento END,
                intentos = intentos + CASE WHEN $2::text IN ('${ID.ENTREGADO}','${ID.FALLIDO}') THEN 1 ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`, [id, ID[hacia], receptorNombre, receptorDocumento]);
        await client.query('COMMIT');

        triggerUpload();
        notificarCambioEstado(id, hacia, motivo);
        res.json({ success: true, data: { estado: hacia } });
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        // Carrera entre dos reenvíos offline con el mismo client_uuid
        if (err.code === '23505' && String(err.constraint || '').includes('client_uuid')) {
            return res.json({ success: true, duplicado: true });
        }
        console.error('[GH-MENSAJERIA] accionMensajero:', err.message);
        res.status(500).json({ success: false, error: 'Error al registrar la acción' });
    } finally {
        client.release();
    }
};

// ── Archivos ──────────────────────────────────────────────────────────────────

/** Sirve una firma/foto. Solo administración de mensajería o el mensajero asignado al envío. */
export const getArchivo = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.archivoId);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const { rows } = await pool.query(`
            SELECT a.mime, a.drive_path, a.local_path, e.mensajero_id
            FROM gh_mensajeria_archivos a JOIN gh_mensajeria_envios e ON e.id = a.envio_id
            WHERE a.id = $1`, [id]);
        if (!rows.length) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        if (!isAdmin(req)) {
            const pid = await personalIdDelUsuario(actor(req).id);
            if (!pid || pid !== rows[0].mensajero_id) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        res.setHeader('Content-Type', rows[0].mime);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const stream = streamStoredFile(rows[0]);
        stream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.end(); });
        stream.pipe(res);
    } catch (err: any) {
        console.error('[GH-MENSAJERIA] getArchivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al obtener el archivo' });
    }
};
