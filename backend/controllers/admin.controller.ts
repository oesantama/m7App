import { Request, Response } from 'express';
import pool from '../config/database.js';

// Middleware-like check (can be used inside controllers too for double safety)
// Middleware de validación robusta para Administrador
const isUserAdmin = (user: any) => {
  if (!user) return false;
  return user.email === 'directorti@millasiete.com' || user.roleId === 'ROL-01' || user.role_id === 'ROL-01';
};

export const getTables = async (req: any, res: Response) => {
  try {
    const user = req.user; 
    // Security Check
    if (!isUserAdmin(user)) {
      return res.status(403).json({ error: "Acceso denegado. Solo admin." });
    }

    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    res.json(result.rows.map(r => r.table_name));
  } catch (err: any) {
    console.error('[ADMIN-GET-TABLES]', err.message);
    res.status(500).json({ error: "Error al obtener tablas" });
  }
};

export const getTableData = async (req: any, res: Response) => {
  const { tableName, page = 1, limit = 50, search = '', sortBy, sortOrder = 'ASC', conditions = [] } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName) return res.status(400).json({ error: "Nombre de tabla requerido" });

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    const offset = (page - 1) * limit;
    let query = `SELECT * FROM ${tableName} t`;
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName} t`;
    const params: any[] = [];
    let whereClauses: string[] = [];

    if (search) {
       whereClauses.push(`EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(t)) WHERE value ILIKE $${params.length + 1})`);
       params.push(`%${search}%`);
    }

    if (Array.isArray(conditions) && conditions.length > 0) {
        let conditionStr = '';
        conditions.forEach((c, index) => {
            if (!/^[a-zA-Z0-9_]+$/.test(c.column)) return;
            const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL'];
            const op = validOperators.includes(c.operator?.toUpperCase()) ? c.operator.toUpperCase() : '=';
            
            const logical = (index === 0) ? '' : (c.logical?.toUpperCase() === 'OR' ? ' OR ' : ' AND ');
            
            if (op === 'IS NULL' || op === 'IS NOT NULL') {
                conditionStr += `${logical} t.${c.column} ${op}`;
            } else {
                params.push(op === 'LIKE' || op === 'ILIKE' ? `%${c.value}%` : c.value);
                conditionStr += `${logical} t.${c.column} ${op} $${params.length}`;
            }
        });
        if (conditionStr) {
            whereClauses.push(`(${conditionStr})`);
        }
    }

    let whereSql = '';
    if (whereClauses.length > 0) {
        whereSql = ` WHERE ` + whereClauses.join(' AND ');
    }

    query += whereSql;
    countQuery += whereSql;

    // Add Sorting
    if (sortBy) {
        if (/^[a-zA-Z0-9_]+$/.test(sortBy)) {
             const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
             query += ` ORDER BY ${sortBy} ${order}`;
        }
    }

    // Copy params for countQuery before adding limit/offset
    const countParams = [...params];

    // Add Pagination
    // Handle "Show All" by passing -1 or very large limit? 
    // If limit is very large, just use it. If frontend sends 1000000 it works.
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
        data: result.rows,
        total: parseInt(countResult.rows[0].total),
        page,
        limit
    });
  } catch (err: any) {
    console.error('[ADMIN-GET-DATA]', err.message);
    res.status(500).json({ error: "Error al obtener datos" });
  }
};

export const executeSql = async (req: any, res: Response) => {
    const { query } = req.body;
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        if (!query) return res.status(400).json({ error: "Query requerido" });

        // DANGEROUS: Raw SQL execution.
        const result = await pool.query(query);
        
        // Determine type of result
        if (Array.isArray(result)) {
             // Multi-statement? usually pg returns array if multiple queries.
             res.json(result.map(r => ({ rows: r.rows, rowCount: r.rowCount })));
        } else {
             res.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
        }
    } catch (err: any) {
        console.error('[ADMIN-SQL]', err.message);
        res.status(400).json({ error: err.message });
    }
}

export const saveRecord = async (req: any, res: Response) => {
  const { tableName, data, isUpdate } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return res.status(400).json({ error: "Tabla inválida" });

    const keys = Object.keys(data);
    const values = Object.values(data);

    // Validar nombres de columna para prevenir inyección SQL via nombres de campo
    const invalidCol = keys.find(k => !/^[a-zA-Z0-9_]+$/.test(k));
    if (invalidCol) return res.status(400).json({ error: `Nombre de columna inválido: ${invalidCol}` });
    
    // Check if it's an UPDATE or INSERT based on frontend flag
    if (isUpdate) {
       // UPDATE
       const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
       const idVal = data.id;
       // Remove ID from values to push it at end? No, cleaner to rebuild query params
       // ACTUALLY: The setClause includes id=$1 which is fine (id=id) or redundant but works.
       // BUT usually we don't update ID. Let's separate.
       
       const updateKeys = keys.filter(k => k !== 'id');
       const updateValues = updateKeys.map(k => data[k]);
       const setClauseStr = updateKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
       
       // Add ID as last param
       updateValues.push(idVal);
       
       await pool.query(`UPDATE ${tableName} SET ${setClauseStr} WHERE id = $${updateValues.length}`, updateValues);
       res.json({ success: true, action: 'UPDATE' });
       
    } else {
       // INSERT
       const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
       await pool.query(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`, values);
       res.json({ success: true, action: 'INSERT' });
    }

  } catch (err: any) {
    console.error('[ADMIN-SAVE]', err.message);
    res.status(500).json({ error: "Error al guardar registro" });
  }
};

// ... (existing deleteRecord logic)
export const deleteRecord = async (req: any, res: Response) => {
  const { tableName, id } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName || !id) return res.status(400).json({ error: "Datos incompletos" });

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    res.json({ success: true, action: 'DELETE' });
  } catch (err: any) {
    console.error('[ADMIN-DELETE]', err.message);
    res.status(500).json({ error: "Error al eliminar registro" });
  }
};

export const bulkDeleteRecords = async (req: any, res: Response) => {
  const { tableName, ids } = req.body;
  const user = req.user;
  try {
    if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
    if (!tableName || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Datos incompletos o inválidos" });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, action: 'BULK_DELETE', count: ids.length });
  } catch (err: any) {
    console.error('[ADMIN-BULK-DELETE]', err.message);
    res.status(500).json({ error: "Error al eliminar registros masivamente" });
  }
};

export const getTableSchema = async (req: any, res: Response) => {
    const { tableName } = req.body;
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        if (!tableName) return res.status(400).json({ error: "Nombre de tabla requerido" });

        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
             return res.status(400).json({ error: "Nombre de tabla inválido" });
        }

        // Query de columnas usando pg_catalog directamente (evita ambigüedades de information_schema)
        const query = `
            SELECT
                a.attname                                          AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod)   AS data_type,
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END   AS is_nullable,
                NULL::integer                                      AS character_maximum_length,
                pg_catalog.pg_get_expr(d.adbin, d.adrelid)        AS column_default,
                pg_catalog.col_description(c.oid, a.attnum)       AS column_description,
                CASE WHEN pk.attname IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_foreign_key,
                fk.foreign_table_name,
                fk.foreign_column_name
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
            LEFT JOIN (
                SELECT a2.attname
                FROM pg_catalog.pg_index i
                JOIN pg_catalog.pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = ANY(i.indkey)
                WHERE i.indrelid = (SELECT oid FROM pg_class WHERE relname = $1 AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
                  AND i.indisprimary
            ) pk ON pk.attname = a.attname
            LEFT JOIN (
                SELECT kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'
            ) fk ON fk.column_name = a.attname
            WHERE c.relname = $1 AND n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY a.attnum;
        `;
        
        const result = await pool.query(query, [tableName]);
        
        // Also get table comment
        const commentQuery = `
            SELECT obj_description(oid) 
            FROM pg_class 
            WHERE relname = $1;
        `;
        const commentResult = await pool.query(commentQuery, [tableName]);
        
        res.json({
            columns: result.rows,
            description: commentResult.rows[0]?.obj_description || 'Sin descripción'
        });

    } catch (err: any) {
        console.error('[ADMIN-SCHEMA]', err.message);
        res.status(500).json({ error: "Error al obtener esquema" });
    }
};

export const runCron = async (req: any, res: Response) => {
    const { cronName } = req.body;
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        if (!cronName) return res.status(400).json({ error: "Nombre del cron requerido" });

        const scheduler = await import('../services/scheduler.service.js');
        // Usamos require o import dinámico para el scraper si es necesario
        const scraper = await import('../services/scraper.service.js');
        let logs: string[] = [];

        switch (cronName) {
            case 'syncDrive':
                logs = await scheduler.manualRunSyncDrive();
                break;
            case 'cleanNews':
                logs = await scheduler.manualRunCleanNews();
                break;
            case 'facturacionPendiente':
                logs = await scheduler.runFacturacionPendienteGeneral();
                break;
            case 'facturacionPendienteIndividual':
                logs = await scheduler.runFacturacionPendienteIndividual();
                break;
            case 'transportandoUnificado':
                scheduler.manualRunTransportandoUnificado().then(() => {
                    scraper.activeScraperLogs.push("[COMPLETADO] Importación unificada (manifiestos → recaudos → egresos) finalizada.");
                }).catch(err => {
                    scraper.activeScraperLogs.push(`[ERROR CRÍTICO] Importación unificada falló: ${err.message}`);
                });
                logs = ["Iniciando importación unificada (manifiestos → recaudos → egresos) en segundo plano...", "Los 3 procesos corren en secuencia. Observa la terminal de logs."];
                return res.json({ success: true, logs, isBackground: true });
            case 'transportandoScrape':
                scheduler.manualRunTransportandoScrape().then(() => {
                    scraper.activeScraperLogs.push("[COMPLETADO] Scraping de manifiestos (General) finalizado.");
                }).catch(err => {
                    scraper.activeScraperLogs.push(`[ERROR CRÍTICO] Scraping de manifiestos (General) falló: ${err.message}`);
                });
                logs = ["Iniciando importación general en segundo plano...", "Por favor, mantén esta ventana abierta y observa la terminal de logs."];
                return res.json({ success: true, logs, isBackground: true });
            case 'transportandoRecaudosScrape':
                scheduler.manualRunTransportandoRecaudosScrape().then(() => {
                    scraper.activeScraperLogs.push("[COMPLETADO] Scraping de recaudos finalizado.");
                }).catch(err => {
                    scraper.activeScraperLogs.push(`[ERROR CRÍTICO] Scraping de recaudos falló: ${err.message}`);
                });
                logs = ["Iniciando importación de recaudos en segundo plano...", "Por favor, mantén esta ventana abierta y observa la terminal de logs."];
                return res.json({ success: true, logs, isBackground: true });
            case 'transportandoEgresosScrape':
                scheduler.manualRunTransportandoEgresosScrape().then(() => {
                    scraper.activeScraperLogs.push("[COMPLETADO] Scraping de egresos finalizado.");
                }).catch(err => {
                    scraper.activeScraperLogs.push(`[ERROR CRÍTICO] Scraping de egresos falló: ${err.message}`);
                });
                logs = ["Iniciando importación de egresos en segundo plano...", "Por favor, mantén esta ventana abierta y observa la terminal de logs."];
                return res.json({ success: true, logs, isBackground: true });
            default:
                return res.status(404).json({ error: "Cron no encontrado" });
        }

        res.json({ success: true, logs });
    } catch (err: any) {
        console.error('[ADMIN-RUN-CRON]', err.message);
        res.status(500).json({ error: "Error al ejecutar el cron", details: err.message });
    }
};

export const getCronLogs = async (req: any, res: Response) => {
    try {
        const scraper = await import('../services/scraper.service.js');
        res.json({ logs: scraper.activeScraperLogs || [] });
    } catch (e: any) {
        res.json({ logs: [] });
    }
};

export const getPendingDriveCount = async (req: any, res: Response) => {
    const user = req.user;
    try {
        if (!isUserAdmin(user)) return res.status(403).json({ error: "Acceso denegado." });
        const query = `
            SELECT COUNT(d.id) as count
            FROM document_drive_logs d
            WHERE d.category = 'CUMPLIDOS' 
              AND d.client_id = 'CLI-09'
              AND d.upload_date >= CURRENT_DATE - INTERVAL '5 days'
              AND NOT EXISTS (
                  SELECT 1 FROM registros_logistica rl 
                  WHERE rl.archivo = d.file_name
              )
        `;
        const { rows } = await pool.query(query);
        res.json({ count: parseInt(rows[0].count) });
    } catch (err: any) {
        console.error('[ADMIN-GET-PENDING-DRIVE]', err.message);
        res.status(500).json({ error: "Error al obtener pendientes", details: err.message });
    }
};
