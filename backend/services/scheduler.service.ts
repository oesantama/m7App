import cron from 'node-cron';
import v8 from 'v8';
import pool from '../config/database.js';
import { syncDriveCumplidos } from './drive-gemini.service.js';
import { scrapeTransportandoReports } from './scraper.service.js';
import { whatsappCronRunner } from './whatsapp-cron.service.js';
import { runDailyHealthReport } from './health-report.service.js';

/**
 * Retrocede N días hábiles (lunes-viernes) desde una fecha dada.
 * Ejemplo: si hoy es lunes y N=5, retorna el lunes de la semana anterior.
 */
function subtractBusinessDays(fromDate: Date, businessDays: number): Date {
    const result = new Date(fromDate);
    let remaining = businessDays;
    while (remaining > 0) {
        result.setDate(result.getDate() - 1);
        const dow = result.getDay(); // 0=Domingo, 6=Sábado
        if (dow !== 0 && dow !== 6) {
            remaining--;
        }
    }
    // Retroceder al inicio del día (00:00:00) para incluir todo el día de corte
    result.setHours(0, 0, 0, 0);
    return result;
}

/**
 * Formatea una fecha a formato YYYY/MM/DD local
 */
function formatDateYYYYMMDD(dateVal: any): string {
    if (!dateVal) return 'S/I';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'S/I';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
}

/**
 * Ejecuta una función y registra el resultado en la tabla cron_logs.
 */
async function executeWithCronLog(taskName: string, taskFunction: () => Promise<any>) {
    let cronLogId: number | null = null;
    const startTime = Date.now();
    try {
        const initLog = await pool.query(
            `INSERT INTO cron_logs (task_name, status, details, duration_ms) VALUES ($1, 'RUNNING', 'Iniciando ejecución...', 0) RETURNING id`,
            [taskName]
        );
        cronLogId = initLog.rows[0]?.id || null;
        
        const resultLogs = await taskFunction();
        
        let details = 'Ejecución exitosa';
        if (Array.isArray(resultLogs) && resultLogs.length > 0) {
            details = resultLogs.join(' | ');
            if (details.length > 50000) details = details.substring(0, 49997) + '...';
        }
        
        if (cronLogId) {
            await pool.query(
                `UPDATE cron_logs SET status='SUCCESS', details=$1, duration_ms=$2 WHERE id=$3`,
                [details, Date.now() - startTime, cronLogId]
            );
        }
    } catch (err: any) {
        if (cronLogId) {
            await pool.query(
                `UPDATE cron_logs SET status='ERROR', error_message=$1, duration_ms=$2 WHERE id=$3`,
                [err.message || 'Error desconocido', Date.now() - startTime, cronLogId]
            );
        } else {
            await pool.query(
                `INSERT INTO cron_logs (task_name, status, error_message, duration_ms) VALUES ($1, 'ERROR', $2, $3)`,
                [taskName, err.message || 'Error desconocido', Date.now() - startTime]
            );
        }
    }
}

/**
 * Servicio de Tareas Programadas (M7 Scheduler)
 */
/**
 * Ejecución manual desde el panel de administración. La facturación pendiente (general y por
 * cliente) es ahora la alerta FACTURACION_PENDIENTE: cada destinatario recibe su alcance.
 */
export const runFacturacionPendienteIndividual = async (): Promise<string[]> =>
    whatsappCronRunner.runByTipo('FACTURACION_PENDIENTE');

export const initScheduler = () => {
    console.log('[M7-SCHEDULER] Inicializando Motor de Tareas Programadas...');

    // WhatsApp alertas corren en todos los entornos donde Evolution esté disponible
    whatsappCronRunner.loadAndSchedule().catch(err =>
        console.warn('[WA-CRON] loadAndSchedule falló en arranque:', err.message)
    );

    if (process.env.NODE_ENV !== 'production') {
        console.log('[M7-SCHEDULER] Entorno no es de producción (NODE_ENV no es production). Cron jobs desactivados.');
        return;
    }

    // Limpieza de Novedades: se eliminan registros con más de 5 días hábiles (L-V).
    // Corre diariamente a la 1:00 AM hora Colombia.
    cron.schedule('0 1 * * *', async () => {
        const startTime = Date.now();

        // Calcular la fecha límite: 5 días hábiles atrás desde hoy
        const cutoff = subtractBusinessDays(new Date(), 5);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        console.log(`[M7-SCHEDULER] Limpiando novedades anteriores a ${cutoffStr} (5 días hábiles)...`);

        await executeWithCronLog('Limpieza_Novedades', async () => {
            const result = await pool.query(
                `DELETE FROM inventory_news WHERE created_at < $1`,
                [cutoff]
            );
            const duration = Date.now() - startTime;
            console.log(`[M7-SCHEDULER] Limpieza completada. Eliminados: ${result.rowCount} registros | Duración: ${duration}ms`);
            return [`Eliminados: ${result.rowCount} registros`];
        });
    }, {
        timezone: 'America/Bogota'
    });

    console.log('[M7-SCHEDULER] Tarea "Limpieza Novedades" programada: Diariamente 01:00 AM | Retención: 5 días hábiles (L-V)');

    // DESHABILITADO: Sync Drive Planillas CLI-09 consumía todos los tokens Gemini sin resolver errores.
    // Activar manualmente solo cuando haya cuota disponible y se corrija el AI Orchestrator.
    // cron.schedule('*/15 * * * *', async () => { await syncDriveCumplidos(); }, { timezone: 'America/Bogota' });
    console.log('[M7-SCHEDULER] DESHABILITADO: Sync_Drive_Planillas_CLI09 (consumo excesivo de tokens Gemini)');

    // Facturación Pendiente (general y por cliente): ya no es un cron fijo. Es la alerta
    // FACTURACION_PENDIENTE de Alertas WhatsApp (migración 010, Lun–Sáb 9:00 AM), donde cada
    // destinatario define canal (WhatsApp/correo/ambos) y alcance (todos los clientes o uno).
    console.log('[M7-SCHEDULER] Facturación Pendiente → gestionada por Alertas WhatsApp (tipo FACTURACION_PENDIENTE)');

    // Scraping e importación automática desde Transportando: Todos los días a las 5:00 AM
    // NOTA: A las 3am Transportando aún no ha finalizado el procesamiento del día anterior
    // Importación unificada desde Transportando: 2 AM secuencial (manifiestos → recaudos → egresos)
    // Secuencial para evitar conflicto de sesión simultánea en Transportando.
    cron.schedule('0 2 * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron unificado Transportando: manifiestos → recaudos → egresos → preoperacional...');
        await executeWithCronLog('Importacion_Transportando', async () => {
            const logs1 = await scrapeTransportandoReports('manifiestos');
            console.log('[M7-SCHEDULER] Manifiestos OK:', logs1.join(' | '));
            const logs2 = await scrapeTransportandoReports('recaudos');
            console.log('[M7-SCHEDULER] Recaudos OK:', logs2.join(' | '));
            const logs3 = await scrapeTransportandoReports('egresos');
            console.log('[M7-SCHEDULER] Egresos OK:', logs3.join(' | '));
            const logs4 = await scrapeTransportandoReports('preoperacional');
            console.log('[M7-SCHEDULER] Preoperacional OK:', logs4.join(' | '));
            return [...logs1, ...logs2, ...logs3, ...logs4];
        });
    }, { timezone: 'America/Bogota' });
    console.log('[M7-SCHEDULER] Tarea "Importación Transportando (unificada)" programada: Diariamente 02:00 AM');

    // Importación de Preoperacional a las 5:30 AM para alimentar el informe de las 6:20 AM
    cron.schedule('30 5 * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron de Importación de Preoperacionales desde Transportando...');
        await executeWithCronLog('Importacion_Preoperacional', async () => {
            const logs = await scrapeTransportandoReports('preoperacional');
            console.log('[M7-SCHEDULER] Logs Scraping Preoperacional:', logs.join(' | '));
            return logs;
        });
    }, { timezone: 'America/Bogota' });
    console.log('[M7-SCHEDULER] Tarea "Importación Preoperacional" programada: Diariamente 05:30 AM');

    // Segunda pasada de manifiestos a las 7 AM: alimenta el informe de facturación pendiente (10 AM)
    cron.schedule('0 7 * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron de Importación de Manifiestos (2da pasada) desde Transportando...');
        await executeWithCronLog('Importacion_Transportando_2da', async () => {
            const logs = await scrapeTransportandoReports('manifiestos');
            console.log('[M7-SCHEDULER] Logs Scraping Transportando (2da pasada):', logs.join(' | '));
            return logs;
        });
    }, { timezone: 'America/Bogota' });
    console.log('[M7-SCHEDULER] Tarea "Importación Transportando (2da pasada)" programada: Diariamente 07:00 AM');

    // Validación de Novedades no subidas a Drive: Todos los días a las 11:00 AM
    cron.schedule('0 11 * * *', async () => {
        console.log('[M7-SCHEDULER] Validando novedades pendientes por subir a Drive...');
        await executeWithCronLog('Validacion_Novedades_Drive', async () => {
            const logs = await validateMissingNovedadesDrive();
            console.log('[M7-SCHEDULER] Logs Novedades faltantes:', logs.join(' | '));
            return logs;
        });
    }, {
        timezone: 'America/Bogota'
    });
    console.log('[M7-SCHEDULER] Tarea "Validación Novedades Drive" programada: Diariamente 11:00 AM');

    // ── KEEP-ALIVE: ping interno cada 4 minutos ───────────────────────────────
    // Evita que Traefik/Coolify cierre conexiones TCP inactivas y que el proceso
    // Node.js quede en estado "zombi" sin tráfico. También mantiene el pool de
    // PostgreSQL activo para que la primera petición real no tenga latencia extra.
    cron.schedule('*/10 * * * *', async () => {
        try {
            // 1. Ping a la BD — mantiene al menos 1 conexión viva en el pool
            await pool.query('SELECT 1');

            // 2. Monitoreo de memoria — comparado contra el techo real de V8
            // (heap_size_limit, respeta --max-old-space-size), no contra heapTotal
            // (que es elástico y ronda 85-90% en operación normal — daba falsos avisos).
            const mem = process.memoryUsage();
            const heapUsedMB  = Math.round(mem.heapUsed  / 1024 / 1024);
            const rssMB       = Math.round(mem.rss       / 1024 / 1024);
            const heapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
            const pct = heapLimitMB > 0 ? Math.round((heapUsedMB / heapLimitMB) * 100) : 0;

            if (pct > 85) {
                console.warn(`[M7-KEEPALIVE] ⚠ Heap cerca del límite real: ${heapUsedMB}/${heapLimitMB}MB (${pct}%) RSS:${rssMB}MB`);
                if (global.gc) global.gc();
            }
        } catch (err: any) {
            console.error('[M7-KEEPALIVE] Error en ping de mantenimiento:', err.message);
        }
    }, { timezone: 'America/Bogota' });

    console.log('[M7-SCHEDULER] Keep-alive programado: cada 10 minutos (ping BD + monitor memoria)');

    // Informe Diario de Salud: envía diagnóstico de infraestructura (pool BD, memoria,
    // queries lentas, tamaño de tablas críticas) al correo del director de TI.
    // Solo diagnostica y sugiere — nunca modifica código ni despliega automáticamente.
    cron.schedule('0 6 * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando Informe Diario de Salud...');
        await executeWithCronLog('Informe_Diario_Salud', async () => {
            const logs = await runDailyHealthReport();
            console.log('[M7-SCHEDULER] Logs Informe Diario de Salud:', logs.join(' | '));
            return logs;
        });
    }, {
        timezone: 'America/Bogota'
    });
    console.log('[M7-SCHEDULER] Tarea "Informe Diario de Salud" programada: Diariamente 06:00 AM');
};

// --- CRON MANUAL EXPORTS FOR ADMIN PANEL ---

export const runFacturacionPendienteGeneral = async (): Promise<string[]> =>
    whatsappCronRunner.runByTipo('FACTURACION_PENDIENTE');

export const manualRunSyncDrive = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando cron manual: Sync Drive a Planillas...`);
    try {
        await syncDriveCumplidos();
        logs.push(`Ejecución de syncDriveCumplidos completada sin excepciones críticas.`);
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
    }
    logs.push(`[${new Date().toLocaleString()}] Tarea finalizada.`);
    return logs;
};

export const manualRunCleanNews = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando cron manual: Limpieza Novedades...`);
    const startTime = Date.now();
    const cutoff = subtractBusinessDays(new Date(), 5);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    logs.push(`Limpiando novedades anteriores a ${cutoffStr} (5 días hábiles)...`);

    try {
        const result = await pool.query(
            `DELETE FROM inventory_news WHERE created_at < $1`,
            [cutoff]
        );
        const duration = Date.now() - startTime;
        logs.push(`Limpieza completada. Eliminados: ${result.rowCount} registros | Duración: ${duration}ms`);
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
    }
    logs.push(`[${new Date().toLocaleString()}] Tarea finalizada.`);
    return logs;
};

export const manualRunTransportandoScrape = async (): Promise<string[]> => {
    return await scrapeTransportandoReports('manifiestos');
};

export const manualRunTransportandoRecaudosScrape = async (): Promise<string[]> => {
    return await scrapeTransportandoReports('recaudos');
};

export const manualRunTransportandoEgresosScrape = async (): Promise<string[]> => {
    return await scrapeTransportandoReports('egresos');
};

export const manualRunTransportandoPreoperacionalScrape = async (): Promise<string[]> => {
    return await scrapeTransportandoReports('preoperacional');
};

// Ejecución manual unificada: manifiestos → recaudos → egresos → preoperacional en secuencia
export const manualRunTransportandoUnificado = async (): Promise<string[]> => {
    const logs1 = await scrapeTransportandoReports('manifiestos');
    const logs2 = await scrapeTransportandoReports('recaudos');
    const logs3 = await scrapeTransportandoReports('egresos');
    const logs4 = await scrapeTransportandoReports('preoperacional');
    return [...logs1, ...logs2, ...logs3, ...logs4];
};

export const validateMissingNovedadesDrive = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando validación de novedades no subidas a Drive...`);
    try {
        const { sendEmail } = await import('./notification.service.js');
        const { processAndUploadNovedad } = await import('../controllers/inventory-news.controller.js');
        
        const res = await pool.query(`
            SELECT DISTINCT d.id as doc_id, d.external_doc_id, d.client_id, d.created_at, c.name as client_name
            FROM inventory_news n
            JOIN documents_l d ON n.document_id = d.id
            LEFT JOIN clients c ON d.client_id = c.id
            WHERE n.created_at >= NOW() - INTERVAL '30 days'
              AND NOT EXISTS (
                  SELECT 1 FROM document_drive_logs log 
                  WHERE log.category = 'NOVEDADES MILLA 7' 
                    AND log.file_name ILIKE '%' || REPLACE(COALESCE(d.external_doc_id, d.id::text), ' ', '_') || '.pdf%'
              )
        `);
        
        if (res.rowCount === 0) {
            logs.push(`Todas las novedades recientes han sido registradas en Drive.`);
            return logs;
        }

        logs.push(`Se encontraron ${res.rowCount} documentos con novedades que NO tienen registro en Drive. Iniciando subida automática...`);
        
        let successCount = 0;
        let failCount = 0;
        let htmlBody = `<h3>Novedades procesadas automáticamente por el Cron</h3>
            <p>Se encontraron ${res.rowCount} documentos con novedades en los últimos 30 días que no tenían registro. A continuación, el detalle del procesamiento automático:</p>
            <ul>`;
        
        for (const r of res.rows) {
            const driveDate = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : undefined;
            const clientName = r.client_name || r.client_id || 'SIN_CLIENTE';
            try {
                const result = await processAndUploadNovedad(r.doc_id, clientName, driveDate, 'CRON_SYSTEM');
                htmlBody += `<li>✅ <b>${r.external_doc_id}</b>: Subido con éxito. <a href="${result.driveLink}">Ver en Drive</a></li>`;
                successCount++;
            } catch (upErr: any) {
                console.error(`[CRON-NOV] Error subiendo ${r.external_doc_id}:`, upErr);
                htmlBody += `<li>❌ <b>${r.external_doc_id}</b>: Error al subir. (${upErr.message})</li>`;
                failCount++;
            }
            // Pausa pequeña para no saturar rclone/DB
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        htmlBody += `</ul><p>Total procesados: ${successCount} éxitos, ${failCount} errores.</p>`;

        logs.push(`Proceso completado. Éxitos: ${successCount}. Errores: ${failCount}.`);
        await sendEmail('directorti@millasiete.com', 'Reporte: Auto-Subida de Novedades a Drive', htmlBody);
        logs.push(`Reporte enviado a directorti@millasiete.com.`);
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
    }
    logs.push(`[${new Date().toLocaleString()}] Tarea finalizada.`);
    return logs;
};
