import cron from 'node-cron';
import pool from '../config/database.js';
import { syncDriveCumplidos } from './drive-gemini.service.js';
import { scrapeTransportandoReports } from './scraper.service.js';

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
            if (details.length > 1000) details = details.substring(0, 997) + '...';
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
export const runFacturacionPendienteIndividual = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando cron de Facturación Pendiente Individual (Cruce prov_cliente -> users)...`);
    
    try {
        const { sendEmail } = await import('./notification.service.js');
        const XLSX_MODULE = await import('xlsx');
        const XLSX = XLSX_MODULE.default || XLSX_MODULE;

        // 1. Obtener la tabla general de manifiestos pendientes
        const reportRes = await pool.query(`
            SELECT 
                manifest_number, 
                manifest_date, 
                CASE 
                    WHEN COALESCE(total_cxc, 0) = 0 THEN total_value_cxc_final 
                    ELSE total_cxc 
                END as venta, 
                client_name,
                client_document,
                manifest_status,
                plate
            FROM management_orders 
            WHERE (
                invoice_cxc IS NULL 
                OR TRIM(invoice_cxc) = '' 
                OR TRIM(invoice_cxc) = '0'
                OR UPPER(TRIM(invoice_cxc)) IN ('S/I', 'N/A', 'NA', 'SIN FACTURA CXC')
                OR invoice_date IS NULL
                OR COALESCE(total_cxc, 0) = 0
            )
              AND manifest_number IS NOT NULL
              AND TRIM(manifest_number) <> ''
              AND UPPER(TRIM(COALESCE(manifest_status, ''))) NOT IN ('ANULADO', 'ANULADA')
            ORDER BY client_name, manifest_date DESC
        `);

        if (reportRes.rowCount === 0) {
            logs.push(`No hay facturación pendiente general en este momento. Finalizando tarea individual.`);
            return logs;
        }

        logs.push(`Se encontraron ${reportRes.rowCount} manifiestos pendientes generales.`);

        // 2. Obtener mapeo de proveedores (prov_cliente)
        const provRes = await pool.query(`SELECT documento, client_mappings FROM prov_cliente`);
        const docToClientIds: Record<string, string[]> = {};
        provRes.rows.forEach(r => {
            if (r.client_mappings && r.documento) {
                const mappings = typeof r.client_mappings === 'string' ? JSON.parse(r.client_mappings) : r.client_mappings;
                if (Array.isArray(mappings)) {
                    docToClientIds[String(r.documento).trim()] = mappings.map((m: any) => m.clientId).filter(Boolean);
                }
            }
        });

        // 3. Obtener usuarios activos y sus clientes
        const userRes = await pool.query(`SELECT email, client_ids FROM users WHERE status_id = 'EST-01' AND email IS NOT NULL AND email <> ''`);
        const clientIdToUsers: Record<string, string[]> = {};
        userRes.rows.forEach(r => {
            if (r.client_ids && Array.isArray(r.client_ids)) {
                r.client_ids.forEach((cId: string) => {
                    if (!clientIdToUsers[cId]) clientIdToUsers[cId] = [];
                    if (!clientIdToUsers[cId].includes(r.email)) clientIdToUsers[cId].push(r.email);
                });
            }
        });

        // 4. Agrupar manifiestos por usuario
        const userToManifests: Record<string, any[]> = {};

        reportRes.rows.forEach(manifest => {
            const doc = manifest.client_document ? String(manifest.client_document).trim() : null;
            if (doc && docToClientIds[doc]) {
                const cIds = docToClientIds[doc];
                const matchedEmails = new Set<string>();
                
                cIds.forEach(cId => {
                    const emails = clientIdToUsers[cId] || [];
                    emails.forEach(e => matchedEmails.add(e));
                });

                matchedEmails.forEach(email => {
                    if (!userToManifests[email]) userToManifests[email] = [];
                    userToManifests[email].push(manifest);
                });
            }
        });

        const emailsToSend = Object.keys(userToManifests);
        if (emailsToSend.length === 0) {
            logs.push(`Ningún manifiesto pendiente pudo ser mapeado a un usuario a través de prov_cliente. Finalizando.`);
            return logs;
        }

        logs.push(`Se enviarán reportes individuales a ${emailsToSend.length} usuarios.`);

        // 5. Enviar correos a cada usuario con sus manifiestos
        for (const email of emailsToSend) {
            const userManifests = userToManifests[email];
            
            const excelData = userManifests.map(r => ({
                'Manifiesto': r.manifest_number,
                'Fecha Manifiesto': r.manifest_date ? new Date(r.manifest_date).toLocaleDateString() : 'S/I',
                'Cliente': r.client_name,
                'Estado': r.manifest_status ? String(r.manifest_status).trim() : 'S/I',
                'Placa': r.plate ? String(r.plate).trim() : 'S/I',
                'Valor Venta': Number(r.venta) || 0
            }));

            const summaryByPlate: Record<string, { count: number, total: number }> = {};
            userManifests.forEach(r => {
                const p = r.plate ? String(r.plate).trim() : 'S/I';
                if (!summaryByPlate[p]) summaryByPlate[p] = { count: 0, total: 0 };
                summaryByPlate[p].count++;
                summaryByPlate[p].total += (Number(r.venta) || 0);
            });

            let plateRows = '';
            for (const [p, stats] of Object.entries(summaryByPlate)) {
                plateRows += `<tr><td style="border:1px solid #ccc;padding:4px;">${p}</td><td style="border:1px solid #ccc;padding:4px;text-align:center;">${stats.count}</td><td style="border:1px solid #ccc;padding:4px;text-align:right;">$${stats.total.toLocaleString('es-CO')}</td></tr>`;
            }

            const totalVenta = excelData.reduce((acc, curr) => acc + curr['Valor Venta'], 0);

            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Pendientes');
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            const htmlBody = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #4f46e5;">Reporte de Facturación Pendiente (Por Usuario)</h2>
                    <p>Hola,</p>
                    <p>A continuación, presentamos el consolidado de facturación pendiente correspondiente a los clientes asignados a tu cuenta.</p>
                    <ul>
                        <li><b>Total Manifiestos Pendientes:</b> ${userManifests.length}</li>
                        <li><b>Total Valor Pendiente:</b> $${totalVenta.toLocaleString('es-CO')}</li>
                    </ul>
                    <br/>
                    <table style="border-collapse: collapse; width: 100%; max-width: 400px; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #f3f4f6;">
                                <th style="border:1px solid #ccc;padding:4px;text-align:left;">Placa</th>
                                <th style="border:1px solid #ccc;padding:4px;text-align:center;">Cant.</th>
                                <th style="border:1px solid #ccc;padding:4px;text-align:right;">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${plateRows}
                        </tbody>
                    </table>
                    <br/>
                    <p>Por favor, revisa el archivo Excel adjunto para ver el detalle.</p>
                    <p><small>Este es un mensaje automático generado por M7 App.</small></p>
                </div>
            `;

            try {
                // Send email bypassing notification service typing issues using direct API if needed, but sendEmail is fine
                await sendEmail(email, 'Reporte de Facturación Pendiente Individual - M7 App', htmlBody, [{
                    filename: `facturacion_pendiente_individual_${new Date().toISOString().slice(0,10)}.xlsx`,
                    content: excelBuffer
                }]);
                logs.push(`  - Correo enviado a ${email} (${userManifests.length} manifiestos)`);
            } catch (err: any) {
                logs.push(`  - Error enviando a ${email}: ${err.message}`);
            }

            // M7: WhatsApp Integration para alertas de facturación individual
            try {
                const waRes = await pool.query(
                    `SELECT phone FROM notificaciones_whatsapp 
                     WHERE user_id = (SELECT id FROM users WHERE email = $1 LIMIT 1) 
                     AND status_id = 'EST-01'`, 
                    [email]
                );
                
                if (waRes.rowCount && waRes.rowCount > 0) {
                    const phone = waRes.rows[0].phone;
                    const waBody = `*Reporte de Facturación Pendiente*\nHola,\n\nSe ha enviado a tu correo (${email}) el consolidado de facturación pendiente.\n\n* Total Manifiestos: ${userManifests.length}\n* Total Valor: $${totalVenta.toLocaleString('es-CO')}\n\nRevisa tu bandeja de entrada para ver el detalle por placa.\n\n_M7 App_`;
                    
                    const evoService = await import('./evolution.service.js');
                    await evoService.evolutionService.sendMessage('system', phone, waBody);
                    logs.push(`  - WhatsApp de alerta enviado a ${phone}`);
                }
            } catch (err: any) {
                logs.push(`  - Error enviando WhatsApp a ${email}: ${err.message}`);
            }
        }

        logs.push(`[${new Date().toLocaleString()}] Tarea de Facturación Pendiente Individual finalizada.`);
        return logs;
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
        console.error('[CRON-FACT-INDIVIDUAL]', err);
        return logs;
    }
}

export const initScheduler = () => {
    console.log('[M7-SCHEDULER] Inicializando Motor de Tareas Programadas...');

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

    // Sincronización Automática de Drive a Planillas (Exito Línea Blanca CLI-09)
    // Cron para recuperar el atraso procesando en bloques de a 15, cada 15 minutos.
    cron.schedule('*/15 * * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando sincronización de Drive vs Planillas...');
        await syncDriveCumplidos();
    }, {
        timezone: 'America/Bogota'
    });

    // Cron temporal: solo por hoy (23 de mayo) a las 17:40
    cron.schedule('40 17 23 5 *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando sincronización temporal (Solo por hoy a las 17:40)...');
        await syncDriveCumplidos();
    }, {
        timezone: 'America/Bogota'
    });

    console.log('[M7-SCHEDULER] Tarea "Sync Drive a Planillas" programada: Lunes a Sábado 09:00 AM y (Temporalmente) hoy a las 17:40 PM | Cliente: CLI-09');

    // Facturación Pendiente General: Lunes a Sábado a las 10:00 AM
    cron.schedule('0 10 * * 1-6', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron de Facturación Pendiente General...');
        await executeWithCronLog('Facturacion_Pendiente_General', async () => {
            const logs = await runFacturacionPendienteGeneral();
            console.log('[M7-SCHEDULER] Logs Facturación Pendiente:', logs.join(' | '));
            return logs;
        });
    }, {
        timezone: 'America/Bogota'
    });
    console.log('[M7-SCHEDULER] Tarea "Facturación Pendiente" programada: Lunes a Sábado 10:00 AM');

    // Facturación Pendiente Individual: Lunes a Sábado a las 10:00 AM
    cron.schedule('0 10 * * 1-6', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron de Facturación Pendiente Individual...');
        await executeWithCronLog('Facturacion_Pendiente_Individual', async () => {
            const logs = await runFacturacionPendienteIndividual();
            console.log('[M7-SCHEDULER] Logs Facturación Pendiente Individual:', logs.join(' | '));
            return logs;
        });
    }, {
        timezone: 'America/Bogota'
    });
    console.log('[M7-SCHEDULER] Tarea "Facturación Pendiente Individual" programada: Lunes a Sábado 10:00 AM');

    // Scraping e importación automática desde Transportando: Todos los días a las 5:00 AM
    cron.schedule('0 5 * * *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando cron de Importación de Manifiestos desde Transportando...');
        await executeWithCronLog('Importacion_Transportando', async () => {
            const logs = await scrapeTransportandoReports();
            console.log('[M7-SCHEDULER] Logs Scraping Transportando:', logs.join(' | '));
            return logs;
        });
    }, {
        timezone: 'America/Bogota'
    });
    console.log('[M7-SCHEDULER] Tarea "Importación Transportando" programada: Diariamente 05:00 AM');

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

            // 2. Monitoreo de memoria — si supera 85% del heap, fuerza GC o avisa
            const mem = process.memoryUsage();
            const heapUsedMB  = Math.round(mem.heapUsed  / 1024 / 1024);
            const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
            const rssMB       = Math.round(mem.rss       / 1024 / 1024);
            const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);

            if (pct > 85) {
                console.warn(`[M7-KEEPALIVE] ⚠ Heap alto: ${heapUsedMB}/${heapTotalMB}MB (${pct}%) RSS:${rssMB}MB — forzando GC`);
                if (global.gc) global.gc();
            }
        } catch (err: any) {
            console.error('[M7-KEEPALIVE] Error en ping de mantenimiento:', err.message);
        }
    }, { timezone: 'America/Bogota' });

    console.log('[M7-SCHEDULER] Keep-alive programado: cada 10 minutos (ping BD + monitor memoria)');
};

// --- CRON MANUAL EXPORTS FOR ADMIN PANEL ---

export const runFacturacionPendienteGeneral = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando cron de Facturación Pendiente General...`);
    
    try {
        const { sendEmail } = await import('./notification.service.js');
        const XLSX_MODULE = await import('xlsx');
        const XLSX = XLSX_MODULE.default || XLSX_MODULE;

        logs.push(`Validando correos activos para TGN-04...`);
        const emailRes = await pool.query(`
            SELECT notification_email 
            FROM notificaciones 
            WHERE tipo_notificacion_id = 'TGN-04' AND status_id = 'EST-01'
        `);

        const targetEmails = emailRes.rows.map(r => r.notification_email).filter(Boolean);
        if (targetEmails.length === 0) {
            logs.push(`No hay correos configurados (tipo TGN-04 activos). Finalizando tarea.`);
            return logs;
        }
        logs.push(`Se encontraron ${targetEmails.length} correos de destino.`);

        logs.push(`Consultando manifiestos sin factura (facturación pendiente)...`);
        const reportRes = await pool.query(`
            SELECT 
                manifest_number, 
                manifest_date, 
                CASE 
                    WHEN COALESCE(total_cxc, 0) = 0 THEN total_value_cxc_final 
                    ELSE total_cxc 
                END as venta, 
                client_name,
                manifest_status 
            FROM management_orders 
            WHERE (
                invoice_cxc IS NULL 
                OR TRIM(invoice_cxc) = '' 
                OR TRIM(invoice_cxc) = '0'
                OR UPPER(TRIM(invoice_cxc)) IN ('S/I', 'N/A', 'NA', 'SIN FACTURA CXC')
                OR invoice_date IS NULL
                OR COALESCE(total_cxc, 0) = 0
            )
              AND manifest_number IS NOT NULL
              AND TRIM(manifest_number) <> ''
              AND UPPER(TRIM(COALESCE(manifest_status, ''))) NOT IN ('ANULADO', 'ANULADA')
            ORDER BY manifest_date DESC
        `);

        if (reportRes.rowCount === 0) {
            logs.push(`No hay facturación pendiente en este momento. Finalizando tarea.`);
            return logs;
        }

        logs.push(`Se encontraron ${reportRes.rowCount} manifiestos pendientes.`);

        const excelData = reportRes.rows.map(r => ({
            'Manifiesto': r.manifest_number,
            'Fecha Manifiesto': r.manifest_date ? new Date(r.manifest_date).toLocaleDateString() : 'S/I',
            'Cliente': r.client_name,
            'Estado': r.manifest_status ? String(r.manifest_status).trim() : 'S/I',
            'Valor Venta': Number(r.venta) || 0
        }));

        const totalVenta = excelData.reduce((acc, curr) => acc + curr['Valor Venta'], 0);

        logs.push(`Generando archivo Excel...`);
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Fact_Pendiente");
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const summaryByClient: Record<string, { count: number, total: number }> = {};
        reportRes.rows.forEach(r => {
            const c = r.client_name ? String(r.client_name).trim() : 'S/I';
            if (!summaryByClient[c]) summaryByClient[c] = { count: 0, total: 0 };
            summaryByClient[c].count++;
            summaryByClient[c].total += (Number(r.venta) || 0);
        });

        let clientRows = '';
        for (const [c, stats] of Object.entries(summaryByClient)) {
            clientRows += `<tr><td style="border:1px solid #ccc;padding:4px;">${c}</td><td style="border:1px solid #ccc;padding:4px;text-align:center;">${stats.count}</td><td style="border:1px solid #ccc;padding:4px;text-align:right;">$${stats.total.toLocaleString('es-CO')}</td></tr>`;
        }

        const html = `
            <h2>Resumen de Facturación Pendiente General</h2>
            <p>Se adjunta el reporte de facturación pendiente con todos los manifiestos no facturados.</p>
            <ul>
                <li><strong>Total Manifiestos Pendientes:</strong> ${reportRes.rowCount}</li>
                <li><strong>Valor Total Pendiente:</strong> $${totalVenta.toLocaleString('es-CO')}</li>
            </ul>
            <br/>
            <table style="border-collapse: collapse; width: 100%; max-width: 600px; font-size: 14px;">
                <thead>
                    <tr style="background-color: #f3f4f6;">
                        <th style="border:1px solid #ccc;padding:4px;text-align:left;">Cliente</th>
                        <th style="border:1px solid #ccc;padding:4px;text-align:center;">Cant.</th>
                        <th style="border:1px solid #ccc;padding:4px;text-align:right;">Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientRows}
                </tbody>
            </table>
            <br/>
            <p>Por favor, revisa el archivo Excel adjunto para ver el detalle completo.</p>
        `;

        logs.push(`Enviando correos a: ${targetEmails.join(', ')}...`);
        for (const email of targetEmails) {
            await sendEmail(email, 'Reporte de Facturación Pendiente General', html, [{
                filename: 'facturacion_pendiente_general.xlsx',
                content: excelBuffer
            }]);
        }
        logs.push(`Correos enviados exitosamente.`);
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
        console.error('[CRON-FACT-PENDIENTE]', err);
    }

    logs.push(`[${new Date().toLocaleString()}] Tarea finalizada.`);
    return logs;
};

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
    return await scrapeTransportandoReports();
};

export const validateMissingNovedadesDrive = async (): Promise<string[]> => {
    const logs: string[] = [];
    logs.push(`[${new Date().toLocaleString()}] Iniciando validación de novedades no subidas a Drive...`);
    try {
        const { sendEmail } = await import('./notification.service.js');
        const res = await pool.query(`
            SELECT DISTINCT d.id as doc_id, d.external_doc_id, d.client_id, d.created_at
            FROM inventory_news n
            JOIN documents_l d ON n.document_id = d.id
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

        logs.push(`Se encontraron ${res.rowCount} documentos con novedades que NO tienen registro en Drive.`);
        
        // Aquí enviamos una alerta o podríamos subirlos automáticamente.
        // Por ahora enviamos alerta al administrador.
        let htmlBody = `<h3>Novedades pendientes por subir a Drive</h3>
            <p>Se encontraron ${res.rowCount} documentos con novedades en los últimos 30 días que no tienen registro de subida a Drive.</p>
            <ul>`;
        
        res.rows.forEach(r => {
            htmlBody += `<li>Documento ID: ${r.doc_id} | Ref: ${r.external_doc_id} | Fecha: ${new Date(r.created_at).toLocaleDateString()}</li>`;
        });
        htmlBody += `</ul>`;

        await sendEmail('directorti@millasiete.com', 'Alerta: Novedades no subidas a Drive', htmlBody);
        logs.push(`Alerta enviada a directorti@millasiete.com.`);
    } catch (err: any) {
        logs.push(`ERROR CRÍTICO: ${err.message}`);
    }
    logs.push(`[${new Date().toLocaleString()}] Tarea finalizada.`);
    return logs;
};
