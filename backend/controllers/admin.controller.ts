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

import { decryptSqlPayload } from '../utils/crypto.util.js';

let isAuditTableReady = false;
const ensureAuditTable = async () => {
  if (isAuditTableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_superadmin_sql (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        user_email VARCHAR(150),
        ip_address VARCHAR(100),
        query_text TEXT,
        command VARCHAR(50),
        row_count INT,
        status VARCHAR(20),
        error_message TEXT,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    isAuditTableReady = true;
  } catch (err: any) {
    console.warn('[ADMIN-SQL-AUDIT] No se pudo verificar tabla de auditoría:', err.message);
  }
};

export const executeSql = async (req: any, res: Response) => {
    const { query, encryptedQuery } = req.body;
    const user = req.user;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || 'unknown';

    try {
        if (!isUserAdmin(user)) {
          return res.status(403).json({ error: "Acceso denegado. Exclusivo para SuperAdmin." });
        }

        // Descifrar query si viene cifrado con AES-256-GCM desde el frontend
        let resolvedQuery = '';
        if (encryptedQuery) {
          resolvedQuery = decryptSqlPayload(encryptedQuery);
        } else if (query) {
          resolvedQuery = query;
        }

        if (!resolvedQuery || !resolvedQuery.trim()) {
          return res.status(400).json({ error: "Query requerido." });
        }

        // Salvaguarda de Ciberseguridad: Prohibir alteración de roles/usuarios y destrucción de base de datos
        const forbiddenPatterns = [
          /\bDROP\s+DATABASE\b/i,
          /\bDROP\s+SCHEMA\b/i,
          /\bALTER\s+USER\b/i,
          /\bCREATE\s+USER\b/i,
          /\bDROP\s+USER\b/i,
          /\bGRANT\b/i,
          /\bREVOKE\b/i
        ];

        if (forbiddenPatterns.some(pattern => pattern.test(resolvedQuery))) {
          return res.status(403).json({ 
            error: "Operación restringida por política de ciberseguridad. Comandos de administración de usuarios, roles o destrucción estructural están prohibidos desde la consola web." 
          });
        }

        await ensureAuditTable();

        // Ejecutar query
        const result = await pool.query(resolvedQuery);
        
        const command = Array.isArray(result) 
          ? result.map(r => r.command).join(', ') 
          : (result.command || 'UNKNOWN');

        const rowCount = Array.isArray(result)
          ? result.reduce((acc, r) => acc + (r.rowCount || 0), 0)
          : (result.rowCount || 0);

        // Registro de Auditoría Inmutable
        pool.query(
          `INSERT INTO audit_superadmin_sql 
           (user_id, user_email, ip_address, query_text, command, row_count, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [user.id || '', user.email || '', ipAddress, resolvedQuery, command, rowCount, 'SUCCESS']
        ).catch(() => {});

        // Determine type of result
        if (Array.isArray(result)) {
             res.json(result.map(r => ({ rows: r.rows, rowCount: r.rowCount })));
        } else {
             res.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
        }
    } catch (err: any) {
        console.error('[ADMIN-SQL]', err.message);

        // Registrar fallo en auditoría
        pool.query(
          `INSERT INTO audit_superadmin_sql 
           (user_id, user_email, ip_address, query_text, command, row_count, status, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user?.id || '', user?.email || '', ipAddress, (req.body.query || 'ENCRYPTED_QUERY'), 'ERROR', 0, 'ERROR', err.message]
        ).catch(() => {});

        res.status(400).json({ error: err.message });
    }
};

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

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Nombre de tabla inválido" });
    }

    if (tableName === 'modules') {
      await pool.query('DELETE FROM pages WHERE module_id = $1 OR parent_id = $1', [id]);
    }

    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    res.json({ success: true, action: 'DELETE' });
  } catch (err: any) {
    console.error('[ADMIN-DELETE]', err.message);
    if (err.code === '23503') {
      return res.status(400).json({ error: "No se puede eliminar el registro porque tiene datos vinculados en otras tablas (restricción de clave foránea)." });
    }
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

    if (tableName === 'modules') {
      await pool.query(`DELETE FROM pages WHERE module_id IN (${placeholders}) OR parent_id IN (${placeholders})`, ids);
    }

    await pool.query(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, action: 'BULK_DELETE', count: ids.length });
  } catch (err: any) {
    console.error('[ADMIN-BULK-DELETE]', err.message);
    if (err.code === '23503') {
      return res.status(400).json({ error: "No se pueden eliminar los registros seleccionados porque están asociados a otras tablas (restricción de clave foránea)." });
    }
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
            case 'transportandoPreoperacionalScrape':
                scheduler.manualRunTransportandoPreoperacionalScrape().then(() => {
                    scraper.activeScraperLogs.push("[COMPLETADO] Scraping de preoperacionales finalizado.");
                }).catch(err => {
                    scraper.activeScraperLogs.push(`[ERROR CRÍTICO] Scraping de preoperacionales falló: ${err.message}`);
                });
                logs = ["Iniciando importación de preoperacionales en segundo plano...", "Por favor, mantén esta ventana abierta y observa la terminal de logs."];
                return res.json({ success: true, logs, isBackground: true });
            case 'reportePreoperacionalEnviar': {
                // Envío real: misma alerta de Alertas WhatsApp (destinatarios, canal y alcance)
                const { whatsappCronRunner } = await import('../services/whatsapp-cron.service.js');
                logs = await whatsappCronRunner.runByTipo('PREOPERACIONAL');
                break;
            }
            case 'reportePreoperacional':
                try {
                    const { generatePreoperacionalReport } = await import('../services/preoperacional-report.service.js');
                    const preopResult = await generatePreoperacionalReport();
                    logs = [
                        `[REPORTE PREOPERACIONAL GENERADO]`,
                        `Fecha: ${preopResult.fechaFormateada}`,
                        `Órdenes Totales: ${preopResult.totalOrders} | Realizados: ${preopResult.totalRealizados} (${preopResult.efectividadGlobal}%) | Aptos: ${preopResult.totalAptos} | Pendientes: ${preopResult.totalPendientes}`,
                        `PDF: ${preopResult.pdfFileName} | Excel: ${preopResult.excelFileName}`
                    ];
                } catch (reportErr: any) {
                    logs = [`[ERROR GENERANDO REPORTE PREOPERACIONAL] ${reportErr.message}`];
                }
                break;
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

export const getMigrationsController = async (req: any, res: Response) => {
    try {
        if (!isUserAdmin(req.user)) return res.status(403).json({ error: "Acceso denegado." });
        const { getMigrationStatus } = await import('../migrations/runner.js');
        const status = await getMigrationStatus();
        res.json(status);
    } catch (err: any) {
        console.error('[ADMIN-GET-MIGRATIONS]', err.message);
        res.status(500).json({ error: "Error al obtener estado de migraciones", details: err.message });
    }
};

export const runMigrationsController = async (req: any, res: Response) => {
    try {
        if (!isUserAdmin(req.user)) return res.status(403).json({ error: "Acceso denegado." });
        const { runMigrations } = await import('../migrations/runner.js');
        const report = await runMigrations();
        res.json({ success: true, report });
    } catch (err: any) {
        console.error('[ADMIN-RUN-MIGRATIONS]', err.message);
        res.status(500).json({ error: "Error al ejecutar migraciones", details: err.message });
    }
};

