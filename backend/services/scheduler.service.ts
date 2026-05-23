import cron from 'node-cron';
import pool from '../config/database.js';
import { syncDriveCumplidos } from './drive-gemini.service.js';

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
 * Servicio de Tareas Programadas (M7 Scheduler)
 */
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

        try {
            const result = await pool.query(
                `DELETE FROM inventory_news WHERE created_at < $1`,
                [cutoff]
            );
            const duration = Date.now() - startTime;
            console.log(`[M7-SCHEDULER] Limpieza completada. Eliminados: ${result.rowCount} registros | Duración: ${duration}ms`);
        } catch (error: any) {
            console.error('[M7-SCHEDULER] ERROR en limpieza de novedades:', error.message);
        }
    }, {
        timezone: 'America/Bogota'
    });

    console.log('[M7-SCHEDULER] Tarea "Limpieza Novedades" programada: Diariamente 01:00 AM | Retención: 5 días hábiles (L-V)');

    // Sincronización Automática de Drive a Planillas (Exito Línea Blanca CLI-09)
    // Cron normal: de Lunes a Sábado (1-6) a las 09:00 hora Colombia (Domingos excluidos)
    cron.schedule('0 9 * * 1-6', async () => {
        console.log('[M7-SCHEDULER] Ejecutando sincronización de Drive vs Planillas...');
        await syncDriveCumplidos();
    }, {
        timezone: 'America/Bogota'
    });

    // Cron temporal: solo por hoy (23 de mayo) a las 17:05
    cron.schedule('5 17 23 5 *', async () => {
        console.log('[M7-SCHEDULER] Ejecutando sincronización temporal (Solo por hoy a las 17:05)...');
        await syncDriveCumplidos();
    }, {
        timezone: 'America/Bogota'
    });

    console.log('[M7-SCHEDULER] Tarea "Sync Drive a Planillas" programada: Lunes a Sábado 09:00 AM y (Temporalmente) hoy a las 17:05 PM | Cliente: CLI-09');
};
