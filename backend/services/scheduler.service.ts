import cron from 'node-cron';
import pool from '../config/database.js';

/**
 * Servicio de Tareas Programadas (M7 Scheduler)
 * Gestiona la limpieza automática de datos temporales para optimizar el servidor.
 */
export const initScheduler = () => {
    console.log('[M7-SCHEDULER] Inicializando Motor de Tareas Programadas...');

    // Tarea 1: Limpieza de Novedades e Imágenes (Cada día a la 1:00 AM)
    // Símbolo Cron: minuto hora día mes día-semana
    cron.schedule('0 1 * * *', async () => {
        const startTime = Date.now();
        console.log('[M7-SCHEDULER] Iniciando limpieza de novedades de más de 30 horas...');

        try {
            // Borramos los registros de inventory_news que tengan más de 30 horas
            // Esto también borra las fotos (Base64) al estar en la misma tabla.
            const result = await pool.query(`
                DELETE FROM inventory_news 
                WHERE created_at < NOW() - INTERVAL '30 hours'
            `);

            const duration = Date.now() - startTime;
            console.log(`[M7-SCHEDULER] Limpieza completada con éxito.`);
            console.log(`- Registros eliminados: ${result.rowCount}`);
            console.log(`- Duración: ${duration}ms`);

        } catch (error: any) {
            console.error('[M7-SCHEDULER] ERROR CRÍTICO en tarea de limpieza:', error.message);
        }
    }, {
        timezone: "America/Bogota" // Aseguramos que corra en hora de Colombia
    });

    console.log('[M7-SCHEDULER] Tarea "Limpieza Novedades" programada: Diariamente 01:00 AM');
};
