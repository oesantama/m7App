import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import {
    validateUpload, saveToQueue, triggerUpload, streamStoredFile, safeSegment, rutaArchivoActivo,
} from '../services/gh-storage.service.js';

/** Estados de activo en la maestra global `estados` (migración 008). */
export const ESTADO_ACTIVO = {
    OPERATIVO: 'EST-24',
    EN_MANTENIMIENTO: 'EST-25',
    DANADO: 'EST-26',
    BAJA: 'EST-27',
} as const;
const ESTADOS_ACTIVO_IDS: string[] = Object.values(ESTADO_ACTIVO);
const CRITICIDADES = ['BAJA', 'MEDIA', 'ALTA'];
const TIPOS_EVENTO = [
    'MANTENIMIENTO_PREVENTIVO', 'MANTENIMIENTO_CORRECTIVO', 'GASTO', 'INCIDENCIA',
    'CAMBIO_RESPONSABLE', 'CAMBIO_UBICACION', 'REVISION', 'BAJA',
];

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
const dateOrNull = (v: any): string | null => {
    const s = str(v, 10);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : null;
};
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Rango de fechas de la consulta; por defecto, lo corrido del mes actual (hora Colombia). */
function rango(q: any): { desde: string; hasta: string } {
    const hoy = hoyBogota();
    let desde = dateOrNull(q.desde) || `${hoy.slice(0, 8)}01`;
    let hasta = dateOrNull(q.hasta) || hoy;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    return { desde, hasta };
}

/** Error de llave foránea → mensaje entendible (maestra inexistente o registro en uso). */
function fkError(err: any, res: Response): boolean {
    if (err.code !== '23503') return false;
    const c = String(err.constraint || '');
    const msg = c.includes('marca') ? 'La marca seleccionada no existe en la maestra.'
        : c.includes('proveedor') ? 'El proveedor seleccionado no existe en la maestra.'
        : c.includes('tipo') ? 'El tipo de activo no existe en la maestra.'
        : c.includes('estado') ? 'El estado seleccionado no existe en la maestra.'
        : 'Uno de los valores seleccionados no existe en la maestra.';
    res.status(400).json({ success: false, error: msg });
    return true;
}

const NOMBRES_MAESTRAS = `t.nombre AS tipo_nombre, p.nombre AS responsable_nombre, ar.nombre AS area_nombre,
           m.name AS marca_nombre, pv.nombre AS proveedor_nombre, es.name AS estado_nombre`;
const JOINS_ACTIVO = `
    FROM gh_activos a
    JOIN gh_activos_tipos t ON t.id = a.tipo_id
    JOIN estados es ON es.id = a.estado_id
    LEFT JOIN gh_personal p ON p.id = a.responsable_id
    LEFT JOIN gh_areas ar ON ar.id = a.area_id
    LEFT JOIN marcas m ON m.id = a.marca_id
    LEFT JOIN prov_cliente pv ON pv.documento = a.proveedor_id`;
const SELECT_ACTIVO = `SELECT a.*, ${NOMBRES_MAESTRAS} ${JOINS_ACTIVO}`;

// ── Catálogos (maestras) ──────────────────────────────────────────────────────

/**
 * Todas las maestras que usa el formulario, en una sola llamada y con el permiso del módulo
 * (así quien solo tiene acceso a Activos no necesita permisos sobre Configuración Maestros).
 * Tipos: Gestión Humana → Misceláneos. Marcas: Configuración Maestros → Marcas.
 * Proveedores: Configuración Maestros → Prov Cliente.
 */
export const getCatalogos = async (_req: AuthRequest, res: Response) => {
    try {
        const [tipos, marcas, proveedores, estados] = await Promise.all([
            pool.query(`SELECT id, nombre FROM gh_activos_tipos WHERE estado = 'EST-01' ORDER BY nombre`),
            pool.query(`SELECT id, name AS nombre FROM marcas WHERE COALESCE(status_id, 'EST-01') = 'EST-01' ORDER BY name`),
            pool.query(`SELECT documento AS id, nombre, documento FROM prov_cliente WHERE COALESCE(estado, 'EST-01') = 'EST-01' ORDER BY nombre`),
            pool.query(`SELECT id, name AS nombre FROM estados WHERE id = ANY($1) ORDER BY id`, [ESTADOS_ACTIVO_IDS]),
        ]);
        res.json({ tipos: tipos.rows, marcas: marcas.rows, proveedores: proveedores.rows, estados: estados.rows });
    } catch (err: any) {
        console.error('[GH-ACTIVOS] getCatalogos:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar maestras' });
    }
};

// ── Activos ───────────────────────────────────────────────────────────────────

/**
 * Listado paginado. El rango de fechas (por defecto el mes en curso) trae los activos con
 * movimiento en el período: registrados, con mantenimiento, gasto, incidencia, etc.
 * `todos=true` ignora el rango (inventario completo).
 */
export const listActivos = async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, intId(req.query.page) || 1);
    const pageSize = Math.min(100, intId(req.query.pageSize) || 20);
    const { desde, hasta } = rango(req.query);
    const todos = req.query.todos === 'true';
    const where: string[] = ['a.deleted_at IS NULL'];
    const params: any[] = [desde, hasta];

    if (!todos) {
        where.push(`EXISTS (SELECT 1 FROM gh_activos_eventos ex WHERE ex.activo_id = a.id AND ex.fecha BETWEEN $1 AND $2)`);
    }
    const q = str(req.query.q, 100);
    if (q) {
        params.push(`%${q}%`);
        const i = params.length;
        where.push(`(a.codigo ILIKE $${i} OR a.nombre ILIKE $${i} OR a.serial ILIKE $${i} OR a.ubicacion ILIKE $${i}
                     OR p.nombre ILIKE $${i} OR m.name ILIKE $${i} OR pv.nombre ILIKE $${i})`);
    }
    const tipoId = intId(req.query.tipo_id);
    if (tipoId) { params.push(tipoId); where.push(`a.tipo_id = $${params.length}`); }
    const estadoId = str(req.query.estado_id, 10);
    if (estadoId && ESTADOS_ACTIVO_IDS.includes(estadoId)) { params.push(estadoId); where.push(`a.estado_id = $${params.length}`); }
    const areaId = intId(req.query.area_id);
    if (areaId) { params.push(areaId); where.push(`a.area_id = $${params.length}`); }
    const marcaId = str(req.query.marca_id, 30);
    if (marcaId) { params.push(marcaId); where.push(`a.marca_id = $${params.length}`); }
    const proveedorId = str(req.query.proveedor_id, 30);
    if (proveedorId) { params.push(proveedorId); where.push(`a.proveedor_id = $${params.length}`); }
    if (req.query.mant_vencido === 'true') {
        where.push(`a.proximo_mantenimiento < CURRENT_DATE AND a.estado_id <> '${ESTADO_ACTIVO.BAJA}'`);
    }

    try {
        const joins = `
            FROM gh_activos a
            LEFT JOIN gh_personal p ON p.id = a.responsable_id
            LEFT JOIN marcas m ON m.id = a.marca_id
            LEFT JOIN prov_cliente pv ON pv.documento = a.proveedor_id`;
        const whereSql = `WHERE ${where.join(' AND ')}`;
        // $1/$2 siempre van en params; si no se usan en el WHERE se referencian para fijar su tipo
        const count = await pool.query(
            `SELECT COUNT(*)::int AS total ${joins} ${whereSql} AND $1::date IS NOT NULL AND $2::date IS NOT NULL`, params);
        params.push(pageSize, (page - 1) * pageSize);
        const { rows } = await pool.query(`
            SELECT a.id, a.codigo, a.nombre, a.serial, a.modelo, a.ubicacion, a.estado_id, a.criticidad,
                   a.costo_inicial, a.fecha_adquisicion, a.proximo_mantenimiento, a.created_at,
                   COALESCE(ev.costo_total, 0) AS total_costos_eventos, COALESCE(ev.costo_periodo, 0) AS costo_periodo,
                   ev.ultimo_evento_fecha, COALESCE(ev.total_eventos, 0) AS total_eventos,
                   ${NOMBRES_MAESTRAS}
            ${JOINS_ACTIVO}
            LEFT JOIN LATERAL (
                SELECT SUM(costo) AS costo_total,
                       SUM(costo) FILTER (WHERE fecha BETWEEN $1::date AND $2::date) AS costo_periodo,
                       MAX(fecha) AS ultimo_evento_fecha, COUNT(*)::int AS total_eventos
                FROM gh_activos_eventos e WHERE e.activo_id = a.id
            ) ev ON TRUE
            ${whereSql}
            ORDER BY ev.ultimo_evento_fecha DESC NULLS LAST, a.codigo DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        res.json({ data: rows, total: count.rows[0].total, page, pageSize, desde, hasta });
    } catch (err: any) {
        console.error('[GH-ACTIVOS] listActivos:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar activos' });
    }
};

/**
 * Indicadores. Los costos y eventos se calculan en el rango (por defecto el mes en curso);
 * además se informa el acumulado del año del rango. Conteos por estado = foto actual.
 * Filtros opcionales: tipo_id, area_id.
 */
export const getDashboard = async (req: AuthRequest, res: Response) => {
    const { desde, hasta } = rango(req.query);
    const anioIni = `${hasta.slice(0, 4)}-01-01`;
    const params: any[] = [desde, hasta, anioIni];
    const filtros: string[] = ['a.deleted_at IS NULL'];
    const tipoId = intId(req.query.tipo_id);
    if (tipoId) { params.push(tipoId); filtros.push(`a.tipo_id = $${params.length}`); }
    const areaId = intId(req.query.area_id);
    if (areaId) { params.push(areaId); filtros.push(`a.area_id = $${params.length}`); }
    const f = filtros.join(' AND ');
    const B = ESTADO_ACTIVO;

    try {
        const [resumen, porTipo, topCostosos, proximos, porEvento] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE a.estado_id = '${B.OPERATIVO}')::int AS operativos,
                       COUNT(*) FILTER (WHERE a.estado_id = '${B.EN_MANTENIMIENTO}')::int AS en_mantenimiento,
                       COUNT(*) FILTER (WHERE a.estado_id = '${B.DANADO}')::int AS danados,
                       COUNT(*) FILTER (WHERE a.estado_id = '${B.BAJA}')::int AS de_baja,
                       COUNT(*) FILTER (WHERE a.criticidad = 'ALTA' AND a.estado_id <> '${B.BAJA}')::int AS criticos,
                       COUNT(*) FILTER (WHERE a.proximo_mantenimiento < CURRENT_DATE AND a.estado_id <> '${B.BAJA}')::int AS mant_vencidos,
                       COUNT(*) FILTER (WHERE a.created_at::date BETWEEN $1 AND $2)::int AS nuevos_periodo,
                       (SELECT COALESCE(SUM(e.costo),0) FROM gh_activos_eventos e JOIN gh_activos a ON a.id = e.activo_id
                         WHERE ${f} AND e.fecha BETWEEN $1 AND $2) AS costo_periodo,
                       (SELECT COUNT(*)::int FROM gh_activos_eventos e JOIN gh_activos a ON a.id = e.activo_id
                         WHERE ${f} AND e.fecha BETWEEN $1 AND $2 AND e.tipo_evento <> 'REGISTRO') AS eventos_periodo,
                       (SELECT COALESCE(SUM(e.costo),0) FROM gh_activos_eventos e JOIN gh_activos a ON a.id = e.activo_id
                         WHERE ${f} AND e.fecha BETWEEN $3 AND $2) AS costo_anio
                FROM gh_activos a WHERE ${f}`, params),
            pool.query(`
                SELECT t.nombre AS tipo, COUNT(DISTINCT a.id)::int AS cantidad,
                       COALESCE(SUM(e.costo) FILTER (WHERE e.fecha BETWEEN $1 AND $2), 0) AS costo_eventos,
                       COUNT(e.id) FILTER (WHERE e.tipo_evento LIKE 'MANTENIMIENTO%' AND e.fecha BETWEEN $1 AND $2)::int AS mantenimientos
                FROM gh_activos a
                JOIN gh_activos_tipos t ON t.id = a.tipo_id
                LEFT JOIN gh_activos_eventos e ON e.activo_id = a.id
                WHERE ${f} AND $3::date IS NOT NULL
                GROUP BY t.nombre ORDER BY costo_eventos DESC, cantidad DESC`, params),
            pool.query(`
                SELECT a.id, a.codigo, a.nombre, t.nombre AS tipo, SUM(e.costo) AS costo_total
                FROM gh_activos a
                JOIN gh_activos_tipos t ON t.id = a.tipo_id
                JOIN gh_activos_eventos e ON e.activo_id = a.id
                WHERE ${f} AND e.fecha BETWEEN $1 AND $2 AND $3::date IS NOT NULL
                GROUP BY a.id, t.nombre HAVING SUM(e.costo) > 0
                ORDER BY costo_total DESC LIMIT 5`, params),
            pool.query(`
                SELECT a.id, a.codigo, a.nombre, a.proximo_mantenimiento, t.nombre AS tipo
                FROM gh_activos a JOIN gh_activos_tipos t ON t.id = a.tipo_id
                WHERE ${f} AND a.estado_id <> '${B.BAJA}'
                  AND a.proximo_mantenimiento <= CURRENT_DATE + INTERVAL '15 days'
                  AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL
                ORDER BY a.proximo_mantenimiento LIMIT 10`, params),
            pool.query(`
                SELECT e.tipo_evento, COUNT(*)::int AS cantidad, COALESCE(SUM(e.costo), 0) AS costo
                FROM gh_activos_eventos e JOIN gh_activos a ON a.id = e.activo_id
                WHERE ${f} AND e.fecha BETWEEN $1 AND $2 AND e.tipo_evento <> 'REGISTRO' AND $3::date IS NOT NULL
                GROUP BY e.tipo_evento ORDER BY costo DESC`, params),
        ]);
        res.json({
            desde, hasta,
            resumen: resumen.rows[0] || {},
            porTipo: porTipo.rows,
            porEvento: porEvento.rows,
            topCostosos: topCostosos.rows,
            proximosMantenimientos: proximos.rows,
        });
    } catch (err: any) {
        console.error('[GH-ACTIVOS] getDashboard:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar el dashboard' });
    }
};

export const getActivo = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const { rows } = await pool.query(`${SELECT_ACTIVO} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
        if (!rows.length) return res.status(404).json({ success: false, error: 'Activo no encontrado' });

        const eventos = await pool.query(`
            SELECT e.id, e.tipo_evento, e.fecha, e.descripcion, e.costo, e.proveedor_id, pv.nombre AS proveedor_nombre,
                   e.factura, e.estado_resultante_id, es.name AS estado_resultante_nombre, e.datos_cambio,
                   e.created_by_name, e.created_at,
                   COALESCE(json_agg(json_build_object(
                       'id', f.id, 'mime', f.mime, 'nombre', f.nombre_original, 'estado_subida', f.estado_subida
                   ) ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL), '[]') AS archivos
            FROM gh_activos_eventos e
            LEFT JOIN prov_cliente pv ON pv.documento = e.proveedor_id
            LEFT JOIN estados es ON es.id = e.estado_resultante_id
            LEFT JOIN gh_activos_archivos f ON f.evento_id = e.id
            WHERE e.activo_id = $1
            GROUP BY e.id, pv.nombre, es.name
            ORDER BY e.fecha DESC, e.id DESC`, [id]);

        res.json({ ...rows[0], eventos: eventos.rows });
    } catch (err: any) {
        console.error('[GH-ACTIVOS] getActivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al cargar el activo' });
    }
};

function parseActivoBody(body: any) {
    const data = {
        tipo_id: intId(body.tipo_id),
        nombre: str(body.nombre, 200),
        descripcion: str(body.descripcion, 2000),
        serial: str(body.serial, 120),
        marca_id: str(body.marca_id, 30),
        modelo: str(body.modelo, 120),
        ubicacion: str(body.ubicacion, 200),
        area_id: intId(body.area_id),
        responsable_id: intId(body.responsable_id),
        proveedor_id: str(body.proveedor_id, 30),
        fecha_adquisicion: dateOrNull(body.fecha_adquisicion),
        costo_inicial: num(body.costo_inicial) ?? 0,
        estado_id: str(body.estado_id, 10) || ESTADO_ACTIVO.OPERATIVO,
        criticidad: str(body.criticidad, 10) || 'MEDIA',
        frecuencia_mantenimiento_dias: intId(body.frecuencia_mantenimiento_dias),
        proximo_mantenimiento: dateOrNull(body.proximo_mantenimiento),
    };
    let error: string | null = null;
    if (!data.tipo_id) error = 'El tipo de activo es obligatorio.';
    else if (!data.nombre) error = 'El nombre del activo es obligatorio.';
    else if (!ESTADOS_ACTIVO_IDS.includes(data.estado_id)) error = 'Estado inválido.';
    else if (!CRITICIDADES.includes(data.criticidad)) error = 'Criticidad inválida.';
    else if (data.costo_inicial < 0) error = 'El costo no puede ser negativo.';
    return { data, error };
}

export const createActivo = async (req: AuthRequest, res: Response) => {
    const { data, error } = parseActivoBody(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const who = actor(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ins = await client.query(`
            INSERT INTO gh_activos (codigo, tipo_id, nombre, descripcion, serial, marca_id, modelo, ubicacion, area_id,
                responsable_id, proveedor_id, fecha_adquisicion, costo_inicial, estado_id, criticidad,
                frecuencia_mantenimiento_dias, proximo_mantenimiento, created_by, updated_by)
            VALUES ('TMP-' || substr(md5(random()::text), 1, 12), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
            RETURNING id`,
            [data.tipo_id, data.nombre, data.descripcion, data.serial, data.marca_id, data.modelo, data.ubicacion,
             data.area_id, data.responsable_id, data.proveedor_id, data.fecha_adquisicion, data.costo_inicial,
             data.estado_id, data.criticidad, data.frecuencia_mantenimiento_dias, data.proximo_mantenimiento, who.id]);
        const id = ins.rows[0].id;
        const codigo = `ACT-${String(id).padStart(5, '0')}`;
        await client.query(`UPDATE gh_activos SET codigo = $1 WHERE id = $2`, [codigo, id]);
        // El registro inicial se fecha hoy: así el activo aparece en el período en que se creó
        await client.query(`
            INSERT INTO gh_activos_eventos (activo_id, tipo_evento, fecha, descripcion, costo, proveedor_id,
                estado_resultante_id, created_by, created_by_name)
            VALUES ($1, 'REGISTRO', $2, $3, 0, $4, $5, $6, $7)`,
            [id, hoyBogota(),
             `Registro del activo${data.fecha_adquisicion ? ` (adquirido el ${data.fecha_adquisicion})` : ''}`,
             data.proveedor_id, data.estado_id, who.id, who.name]);
        await client.query('COMMIT');
        res.json({ success: true, data: { id, codigo } });
    } catch (err: any) {
        await client.query('ROLLBACK');
        if (fkError(err, res)) return;
        console.error('[GH-ACTIVOS] createActivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al crear el activo' });
    } finally {
        client.release();
    }
};

/**
 * Actualiza la ficha. Si cambia el responsable o la ubicación se registra automáticamente
 * un evento CAMBIO_RESPONSABLE / CAMBIO_UBICACION, para que la hoja de vida no pierda ese rastro.
 */
export const updateActivo = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    const { data, error } = parseActivoBody(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const who = actor(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const prev = await client.query(`
            SELECT a.responsable_id, a.ubicacion, p.nombre AS responsable_nombre
            FROM gh_activos a LEFT JOIN gh_personal p ON p.id = a.responsable_id
            WHERE a.id = $1 AND a.deleted_at IS NULL FOR UPDATE OF a`, [id]);
        if (!prev.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Activo no encontrado' });
        }
        const old = prev.rows[0];

        await client.query(`
            UPDATE gh_activos SET tipo_id=$1, nombre=$2, descripcion=$3, serial=$4, marca_id=$5, modelo=$6, ubicacion=$7,
                area_id=$8, responsable_id=$9, proveedor_id=$10, fecha_adquisicion=$11, costo_inicial=$12, estado_id=$13,
                criticidad=$14, frecuencia_mantenimiento_dias=$15,
                proximo_mantenimiento = CASE WHEN $19::boolean THEN $16::date ELSE proximo_mantenimiento END,
                updated_by=$17, updated_at=CURRENT_TIMESTAMP
            WHERE id=$18`,
            [data.tipo_id, data.nombre, data.descripcion, data.serial, data.marca_id, data.modelo, data.ubicacion,
             data.area_id, data.responsable_id, data.proveedor_id, data.fecha_adquisicion, data.costo_inicial, data.estado_id,
             data.criticidad, data.frecuencia_mantenimiento_dias, data.proximo_mantenimiento, who.id, id,
             // Si el cliente no envía el campo se conserva el valor calculado por el último mantenimiento
             Object.prototype.hasOwnProperty.call(req.body, 'proximo_mantenimiento')]);

        if ((old.responsable_id || null) !== (data.responsable_id || null)) {
            const nuevo = data.responsable_id
                ? (await client.query(`SELECT nombre FROM gh_personal WHERE id=$1`, [data.responsable_id])).rows[0]?.nombre
                : null;
            await client.query(`
                INSERT INTO gh_activos_eventos (activo_id, tipo_evento, fecha, descripcion, datos_cambio, created_by, created_by_name)
                VALUES ($1, 'CAMBIO_RESPONSABLE', $2, $3, $4, $5, $6)`,
                [id, hoyBogota(), `Responsable: ${old.responsable_nombre || 'Sin asignar'} → ${nuevo || 'Sin asignar'}`,
                 JSON.stringify({ antes: old.responsable_id, despues: data.responsable_id }), who.id, who.name]);
        }
        if ((old.ubicacion || null) !== (data.ubicacion || null)) {
            await client.query(`
                INSERT INTO gh_activos_eventos (activo_id, tipo_evento, fecha, descripcion, datos_cambio, created_by, created_by_name)
                VALUES ($1, 'CAMBIO_UBICACION', $2, $3, $4, $5, $6)`,
                [id, hoyBogota(), `Ubicación: ${old.ubicacion || 'Sin ubicación'} → ${data.ubicacion || 'Sin ubicación'}`,
                 JSON.stringify({ antes: old.ubicacion, despues: data.ubicacion }), who.id, who.name]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        if (fkError(err, res)) return;
        console.error('[GH-ACTIVOS] updateActivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al actualizar el activo' });
    } finally {
        client.release();
    }
};

/** Borrado lógico: la hoja de vida se conserva para auditoría. */
export const deleteActivo = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const r = await pool.query(
            `UPDATE gh_activos SET deleted_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
            [id, actor(req).id]);
        if (!r.rowCount) return res.status(404).json({ success: false, error: 'Activo no encontrado' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[GH-ACTIVOS] deleteActivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al eliminar el activo' });
    }
};

// ── Eventos (hoja de vida) ────────────────────────────────────────────────────

/**
 * Registra un evento con soportes opcionales (fotos o PDF, campo `archivos`).
 * Si trae `estado_resultante_id`, actualiza el estado del activo. Un mantenimiento recalcula
 * el próximo mantenimiento según la frecuencia configurada.
 */
export const createEvento = async (req: AuthRequest, res: Response) => {
    const activoId = intId(req.params.id);
    if (!activoId) return res.status(400).json({ success: false, error: 'ID inválido' });

    const tipo = str(req.body.tipo_evento, 40);
    const fecha = dateOrNull(req.body.fecha);
    const descripcion = str(req.body.descripcion, 4000);
    const costo = num(req.body.costo) ?? 0;
    let estadoResultante = str(req.body.estado_resultante_id, 10);
    if (!tipo || !TIPOS_EVENTO.includes(tipo)) return res.status(400).json({ success: false, error: 'Tipo de evento inválido.' });
    if (!fecha) return res.status(400).json({ success: false, error: 'La fecha es obligatoria.' });
    if (fecha > hoyBogota()) return res.status(400).json({ success: false, error: 'La fecha no puede ser futura.' });
    if (!descripcion) return res.status(400).json({ success: false, error: 'La descripción es obligatoria.' });
    if (costo < 0) return res.status(400).json({ success: false, error: 'El costo no puede ser negativo.' });
    if (tipo === 'BAJA') estadoResultante = ESTADO_ACTIVO.BAJA;
    if (estadoResultante && !ESTADOS_ACTIVO_IDS.includes(estadoResultante)) return res.status(400).json({ success: false, error: 'Estado inválido.' });

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    let validated;
    try {
        validated = files.map(f => ({ file: f, info: validateUpload(f.buffer, ['image', 'pdf']) }));
    } catch (e: any) {
        return res.status(400).json({ success: false, error: e.message });
    }

    const who = actor(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const act = await client.query(`
            SELECT a.codigo, a.nombre, a.frecuencia_mantenimiento_dias, t.nombre AS tipo_nombre
            FROM gh_activos a JOIN gh_activos_tipos t ON t.id = a.tipo_id
            WHERE a.id = $1 AND a.deleted_at IS NULL FOR UPDATE OF a`, [activoId]);
        if (!act.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Activo no encontrado' });
        }
        const activo = act.rows[0];

        const ev = await client.query(`
            INSERT INTO gh_activos_eventos (activo_id, tipo_evento, fecha, descripcion, costo, proveedor_id, factura,
                estado_resultante_id, created_by, created_by_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [activoId, tipo, fecha, descripcion, costo, str(req.body.proveedor_id, 30), str(req.body.factura, 100),
             estadoResultante, who.id, who.name]);
        const eventoId = ev.rows[0].id;

        const sets: string[] = ['updated_by = $2', 'updated_at = CURRENT_TIMESTAMP'];
        const params: any[] = [activoId, who.id];
        if (estadoResultante) { params.push(estadoResultante); sets.push(`estado_id = $${params.length}`); }
        if (tipo.startsWith('MANTENIMIENTO') && activo.frecuencia_mantenimiento_dias) {
            params.push(fecha, activo.frecuencia_mantenimiento_dias);
            sets.push(`proximo_mantenimiento = $${params.length - 1}::date + ($${params.length} || ' days')::interval`);
        }
        await client.query(`UPDATE gh_activos SET ${sets.join(', ')} WHERE id = $1`, params);

        for (const [i, { file, info }] of validated.entries()) {
            const localPath = saveToQueue(file.buffer, info.ext);
            const drivePath = rutaArchivoActivo({
                tipo: activo.tipo_nombre, codigo: activo.codigo, nombre: activo.nombre, fecha,
                evento: tipo, eventoId, n: i + 1, ext: info.ext,
            });
            await client.query(`
                INSERT INTO gh_activos_archivos (activo_id, evento_id, nombre_original, mime, tamano_bytes, sha256,
                    drive_path, local_path, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [activoId, eventoId, safeSegment(file.originalname || `archivo.${info.ext}`), info.mime, info.size,
                 info.sha256, drivePath, localPath, who.id]);
        }
        await client.query('COMMIT');
        if (validated.length) triggerUpload();
        res.json({ success: true, data: { id: eventoId } });
    } catch (err: any) {
        await client.query('ROLLBACK');
        if (fkError(err, res)) return;
        console.error('[GH-ACTIVOS] createEvento:', err.message);
        res.status(500).json({ success: false, error: 'Error al registrar el evento' });
    } finally {
        client.release();
    }
};

export const getArchivo = async (req: AuthRequest, res: Response) => {
    const id = intId(req.params.archivoId);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    try {
        const { rows } = await pool.query(
            `SELECT mime, drive_path, local_path, nombre_original FROM gh_activos_archivos WHERE id = $1`, [id]);
        if (!rows.length) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        res.setHeader('Content-Type', rows[0].mime);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `inline; filename="${rows[0].nombre_original || 'archivo'}"`);
        const stream = streamStoredFile(rows[0]);
        stream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.end(); });
        stream.pipe(res);
    } catch (err: any) {
        console.error('[GH-ACTIVOS] getArchivo:', err.message);
        res.status(500).json({ success: false, error: 'Error al obtener el archivo' });
    }
};
