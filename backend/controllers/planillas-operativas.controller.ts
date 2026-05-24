import { Request, Response } from 'express';
import pool from '../config/database.js';
import { syncDriveCumplidos } from '../services/drive-gemini.service.js';

// ─── Inicialización y Migración de Esquema ──────────────────────────────────
const initDB = async () => {
    const client = await pool.connect();
    try {
        // 1. Crear tabla base si no existe (con id serial para nuevos registros)
        await client.query(`
            CREATE TABLE IF NOT EXISTS registros_logistica (
                id          BIGSERIAL PRIMARY KEY,
                archivo     VARCHAR(500),
                pedido      VARCHAR(255),
                cedula      VARCHAR(255),
                cliente     VARCHAR(255),
                plu         VARCHAR(255),
                articulo    TEXT,
                direccion   TEXT,
                fecha1      VARCHAR(255),
                fecha2      VARCHAR(255),
                ciudad_barrio VARCHAR(255),
                placa       VARCHAR(255),
                notas       TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Tabla para registrar las ejecuciones del CRON
        await client.query(`
            CREATE TABLE IF NOT EXISTS cron_logs (
                id BIGSERIAL PRIMARY KEY,
                task_name VARCHAR(255) NOT NULL,
                status VARCHAR(50) NOT NULL,
                details TEXT,
                error_message TEXT,
                duration_ms INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Migrar columna id VARCHAR -> BIGSERIAL si sigue siendo VARCHAR
        //    (por compatibilidad con registros existentes)
        const colCheck = await client.query(`
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'registros_logistica' AND column_name = 'id'
        `);

        if (colCheck.rows[0]?.data_type === 'character varying') {
            console.log('[M7-DB] Migrando columna id de VARCHAR a BIGSERIAL...');
            // Añadir columna numérica temporal
            await client.query(`ALTER TABLE registros_logistica ADD COLUMN IF NOT EXISTS new_id BIGSERIAL`);
            await client.query(`ALTER TABLE registros_logistica DROP CONSTRAINT IF EXISTS registros_logistica_pkey`);
            await client.query(`ALTER TABLE registros_logistica DROP COLUMN id`);
            await client.query(`ALTER TABLE registros_logistica RENAME COLUMN new_id TO id`);
            await client.query(`ALTER TABLE registros_logistica ADD PRIMARY KEY (id)`);
            console.log('[M7-DB] Migración de id completada.');
        }

        // 3. Eliminar constraint unique que impedía guardar artículos repetidos en la misma planilla
        const uniqueConstraints = await client.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'registros_logistica'::regclass AND contype = 'u';
        `);
        for (const row of uniqueConstraints.rows) {
            console.log(`[M7-DB] Eliminando restricción única: ${row.conname}`);
            await client.query(`ALTER TABLE registros_logistica DROP CONSTRAINT "${row.conname}"`);
        }

        // 3. (MIGRACIÓN COMPLETADA) Las sentencias de limpiar duplicados y crear
        // el índice único ya se ejecutaron. Dejamos comentado para no bloquear la BD 
        // en cada reinicio del contenedor.
        
        console.log('[M7-DB] Tabla registros_logistica inicializada correctamente.');
    } catch (err: any) {
        console.error('[M7-DB] Error al inicializar registros_logistica:', err.message);
    } finally {
        client.release();
    }
};

initDB();

// ─── POST: Verificar qué archivos ya existen en BD (consulta real) ───────────
export const checkFiles = async (req: Request, res: Response) => {
    const { files } = req.body; // string[]
    if (!Array.isArray(files) || files.length === 0) {
        return res.json({});
    }
    try {
        const placeholders = files.map((_, i) => `$${i + 1}`).join(', ');
        // Devolver registros completos para que la UI muestre toda la info del PDF
        const result = await pool.query(`
            SELECT
                archivo,
                COUNT(*)::int                                    AS total_registros,
                MIN(created_at)                                  AS fecha_subida,
                json_agg(
                    json_build_object(
                        'pedido',        pedido,
                        'cedula',        cedula,
                        'cliente',       cliente,
                        'plu',           plu,
                        'articulo',      articulo,
                        'placa',         placa,
                        'fecha1',        fecha1,
                        'fecha2',        fecha2,
                        'ciudad_barrio', ciudad_barrio
                    )
                    ORDER BY created_at
                )                                                AS registros
            FROM registros_logistica
            WHERE archivo IN (${placeholders})
            GROUP BY archivo
        `, files);

        const map: Record<string, any> = {};
        result.rows.forEach(r => { map[r.archivo] = r; });
        res.json(map);
    } catch (error: any) {
        console.error('Error checking files:', error);
        res.status(500).json({ error: 'Error al verificar archivos' });
    }
};

// ─── GET: Registros con filtros ──────────────────────────────────────────────
export const getRecords = async (req: Request, res: Response) => {
    try {
        const {
            archivo = '', placa = '', plu = '', pedido = '', articulo = '', cliente = '',
            search = '', fechaDesde = '', fechaHasta = '',
            onlyCurrentMonth = 'true'
        } = req.query as any;

        const params: any[] = [];
        const conditions: string[] = [];

        // Filtro de mes actual (default: true)
        // IMPORTANTE: usamos CASE WHEN con regex para evitar TO_DATE sobre valores no-fecha ('N/A', etc.)
        const safeDate = `
            CASE
                WHEN rl.fecha1 ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(rl.fecha1, 'DD/MM/YYYY')
                WHEN rl.fecha1 ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TO_DATE(rl.fecha1, 'YYYY-MM-DD')
                ELSE NULL
            END
        `;

        if (onlyCurrentMonth === 'true') {
            const now = new Date();
            const year  = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const firstDay = `${year}-${month}-01`;
            const lastDay  = new Date(year, now.getMonth() + 1, 0).toISOString().slice(0, 10);
            params.push(firstDay, lastDay);
            conditions.push(`(${safeDate}) BETWEEN $${params.length - 1} AND $${params.length}`);
        }

        // Filtro rango de fecha manual
        if (fechaDesde && fechaHasta && onlyCurrentMonth === 'false') {
            params.push(fechaDesde, fechaHasta);
            conditions.push(`(${safeDate}) BETWEEN $${params.length - 1} AND $${params.length}`);
        }

        if (archivo)  { params.push(`%${archivo}%`);  conditions.push(`rl.archivo  ILIKE $${params.length}`); }
        if (placa)    { params.push(`%${placa}%`);    conditions.push(`rl.placa    ILIKE $${params.length}`); }
        if (plu)      { params.push(`%${plu}%`);      conditions.push(`rl.plu      ILIKE $${params.length}`); }
        if (pedido)   { params.push(`%${pedido}%`);   conditions.push(`rl.pedido   ILIKE $${params.length}`); }
        if (articulo) { params.push(`%${articulo}%`); conditions.push(`rl.articulo ILIKE $${params.length}`); }
        if (cliente)  { params.push(`%${cliente}%`);  conditions.push(`rl.cliente  ILIKE $${params.length}`); }
        if (search)   {
            params.push(`%${search}%`);
            conditions.push(`(
                rl.archivo ILIKE $${params.length} OR rl.pedido ILIKE $${params.length}
                OR rl.cliente ILIKE $${params.length} OR rl.placa ILIKE $${params.length}
                OR rl.articulo ILIKE $${params.length} OR rl.cedula ILIKE $${params.length}
            )`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Verificar si la tabla 'document_drive_logs' existe antes de intentar el JOIN
        const docTableCheck = await pool.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'document_drive_logs' LIMIT 1
        `);
        const hasDocuments = docTableCheck.rows.length > 0;

        // Validar directamente usando el nombre del archivo (rl.archivo = d.file_name)
        // Ya no usamos el pedido porque el nombre del pdf en BD es exactamente rl.archivo
        const driveSubquery = hasDocuments
            ? `(SELECT drive_link FROM document_drive_logs d
               WHERE d.category = 'CUMPLIDOS'
                 AND d.file_name = rl.archivo
               LIMIT 1) as drive_link`
            : `NULL as drive_link`;

        const query = `
            SELECT rl.*, ${driveSubquery}
            FROM registros_logistica rl
            ${whereClause}
            ORDER BY rl.created_at DESC
        `;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error: any) {
        console.error('Error fetching planillas records:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

// ─── POST: Guardar registros (evita duplicados con ON CONFLICT) ──────────────
export const saveRecords = async (req: Request, res: Response) => {
    const records = req.body;
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'No records provided' });
    }

    const client = await pool.connect();
    let savedCount = 0;
    let skippedCount = 0;
    try {
        await client.query('BEGIN');
        for (const r of records) {
            const insQuery = `
                INSERT INTO registros_logistica
                (archivo, pedido, cedula, cliente, plu, articulo, direccion, fecha1, fecha2, ciudad_barrio, placa, notas)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `;
            const result = await client.query(insQuery, [
                r.archivo, r.pedido, r.cedula, r.cliente, r.plu,
                r.articulo, r.direccion, r.fecha1, r.fecha2,
                r.ciudad_barrio, r.placa, r.notas
            ]);
            if (result.rowCount && result.rowCount > 0) {
                savedCount++;
            } else {
                skippedCount++;
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'Records processed', saved: savedCount, skipped: skippedCount });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error saving planillas records:', error);
        res.status(500).json({ error: 'Error del servidor al guardar', detalle: error.message });
    } finally {
        client.release();
    }
};

// ─── POST: Check History (for warnings before upload) ────────────────────────
export const checkHistory = async (req: Request, res: Response) => {
    const { pedidos } = req.body;
    if (!Array.isArray(pedidos) || pedidos.length === 0) {
        return res.json([]);
    }

    try {
        const query = `
            SELECT 
                rl.pedido, 
                COUNT(rl.id) as salidas,
                (SELECT tipo_validacion FROM conciliacion_lb_detalles WHERE viaje_pedido = rl.pedido ORDER BY id DESC LIMIT 1) as estado_entrega
            FROM registros_logistica rl
            WHERE rl.pedido = ANY($1) AND rl.pedido != 'N/A'
            GROUP BY rl.pedido
            HAVING COUNT(rl.id) > 1
        `;
        const { rows } = await pool.query(query, [pedidos]);
        res.json(rows);
    } catch (error: any) {
        console.error('Error checking history:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

// ─── GET: Historial General de Re-despachos ──────────────────────────────────
export const getRedespachos = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT 
                rl.pedido, 
                MAX(rl.cedula) as cedula,
                MAX(rl.cliente) as cliente,
                STRING_AGG(DISTINCT rl.plu, ' | ') as plu,
                STRING_AGG(DISTINCT rl.articulo, ' | ') as articulo,
                MAX(rl.direccion) as direccion,
                STRING_AGG(DISTINCT rl.placa, ' | ') as placa,
                STRING_AGG(DISTINCT rl.fecha1, ' | ') as fecha1,
                STRING_AGG(DISTINCT rl.fecha1 || ' (' || rl.placa || ')', ' ➔ ') as historial_salidas,
                COUNT(DISTINCT rl.fecha1 || rl.placa) as salidas,
                (SELECT tipo_validacion FROM conciliacion_lb_detalles WHERE viaje_pedido = rl.pedido ORDER BY id DESC LIMIT 1) as estado_entrega
            FROM registros_logistica rl
            WHERE rl.pedido != 'N/A' AND rl.pedido != ''
            GROUP BY rl.pedido
            HAVING COUNT(DISTINCT rl.fecha1 || rl.placa) > 1
            ORDER BY salidas DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error: any) {
        console.error('Error getting redespachos:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

// ─── DELETE: Eliminar un registro ────────────────────────────────────────────
export const removeRecord = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM registros_logistica WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting record:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

// ─── PUT: Actualizar un registro ────────────────────────────────────────────
export const updateRecord = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { pedido } = req.body;
    
    try {
        // Validar si ya existe este pedido con los mismos datos (para evitar duplicados al editar)
        const checkQuery = `
            SELECT id FROM registros_logistica 
            WHERE pedido = $1 
            AND id != $2
            AND cedula = (SELECT cedula FROM registros_logistica WHERE id = $2 LIMIT 1)
            AND plu = (SELECT plu FROM registros_logistica WHERE id = $2 LIMIT 1)
            AND archivo != (SELECT archivo FROM registros_logistica WHERE id = $2 LIMIT 1)
            LIMIT 1
        `;
        const { rowCount } = await pool.query(checkQuery, [pedido, id]);
        
        if (rowCount && rowCount > 0) {
            return res.status(400).json({ error: 'Este Pedido ya existe para este cliente y artículo en OTRA planilla.' });
        }

        const updateQuery = `
            UPDATE registros_logistica
            SET pedido = $1
            WHERE id = $2
            RETURNING *
        `;
        const { rows } = await pool.query(updateQuery, [pedido, id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        res.json(rows[0]);
    } catch (error: any) {
        console.error('Error updating record:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};
// ─── DELETE ALL: Limpiar tabla ────────────────────────────────────────────────
export const clearRecords = async (req: Request, res: Response) => {
    try {
        await pool.query('DELETE FROM registros_logistica');
        console.log(`[AUDITORIA M7] LIMPIEZA MASIVA DE REGISTROS. TS: ${new Date().toISOString()}`);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error clearing records:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

// ─── POST: Forzar sincronización manual del CRON ────────────────────────────
export const forceSync = async (req: Request, res: Response) => {
    // Se ejecuta de fondo para no bloquear la petición
    syncDriveCumplidos().catch(err => console.error("Error en forceSync:", err));
    res.json({ message: "Sincronización de Drive iniciada en segundo plano. Revisa los logs del cron en unos minutos." });
};
