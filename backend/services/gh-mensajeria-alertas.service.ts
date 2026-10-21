/**
 * Notificaciones WhatsApp y alertas de Mensajería + cron de reintentos de subida a Drive.
 *
 * WhatsApp se envía al remitente (gh_personal) y al destinatario (teléfono del envío) cuando el
 * envío sale a ruta, se entrega o falla; y al mensajero cuando se le asigna. Por defecto solo
 * se envía en producción; en otros entornos se activa con GH_MENSAJERIA_WA_ENABLED=true.
 */
import cron from 'node-cron';
import pool from '../config/database.js';
import { evolutionService } from './evolution.service.js';
import { processUploadQueue } from './gh-storage.service.js';
import { HORAS_ALERTA_ATRASO, EstadoEnvio, ESTADO_ID as ID, ESTADOS_ABIERTOS, idsSql } from './gh-mensajeria.logic.js';

const WA_ENABLED = process.env.GH_MENSAJERIA_WA_ENABLED
    ? process.env.GH_MENSAJERIA_WA_ENABLED === 'true'
    : process.env.NODE_ENV === 'production';
const HORAS_SIN_ASIGNAR = Number(process.env.GH_MENSAJERIA_HORAS_SIN_ASIGNAR || 4);

async function sendWa(phone: string | null | undefined, text: string): Promise<void> {
    const clean = String(phone || '').replace(/\D/g, '');
    if (clean.length < 10) return;
    if (!WA_ENABLED) {
        console.log(`[GH-MENSAJERIA] (WA deshabilitado) → ${clean}: ${text.split('\n')[0]}`);
        return;
    }
    try {
        const instance = process.env.WA_ALERTS_INSTANCE || await evolutionService.findFirstConnectedInstance();
        if (!instance) return;
        await evolutionService.sendMessageDirect(instance, clean, text);
    } catch (err: any) {
        console.warn('[GH-MENSAJERIA] WhatsApp falló:', err.message);
    }
}

async function cargarEnvio(envioId: number) {
    const { rows } = await pool.query(`
        SELECT e.*, es.name AS estado_nombre, r.nombre AS remitente_nombre,
               COALESCE(NULLIF(r.celular_corporativo,''), r.celular_personal) AS remitente_telefono,
               m.nombre AS mensajero_nombre,
               COALESCE(NULLIF(m.celular_corporativo,''), m.celular_personal) AS mensajero_telefono
        FROM gh_mensajeria_envios e
        JOIN estados es ON es.id = e.estado_id
        JOIN gh_personal r ON r.id = e.remitente_id
        LEFT JOIN gh_personal m ON m.id = e.mensajero_id
        WHERE e.id = $1`, [envioId]);
    return rows[0];
}

const fmtFecha = (d: Date | string) =>
    new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });

/** Notifica un cambio de estado. Nunca lanza: los fallos de WhatsApp no afectan la operación. */
export async function notificarCambioEstado(envioId: number, estado: EstadoEnvio, motivo?: string | null): Promise<void> {
    try {
        const e = await cargarEnvio(envioId);
        if (!e) return;
        const ref = `*${e.tracking}* (${e.tipo.toLowerCase()}: ${String(e.contenido).slice(0, 60)})`;

        if (estado === 'ASIGNADO') {
            await sendWa(e.mensajero_telefono,
                `📦 *OrbitM7 · Mensajería*\nSe te asignó el envío ${ref}.\nDestino: ${e.destinatario_direccion}, ${e.destinatario_ciudad}.\nRevisa "Mis Envíos" en OrbitM7.`);
            return;
        }

        let msgRem = '', msgDest = '';
        if (estado === 'EN_CAMINO') {
            msgRem = `🚚 *OrbitM7 · Mensajería*\nTu envío ${ref} ya fue recogido por ${e.mensajero_nombre || 'el mensajero'} y va en camino a ${e.destinatario_nombre}.`;
            msgDest = `🚚 *Milla 7*\nHola ${e.destinatario_nombre}, ${e.remitente_nombre} te envió ${e.tipo.toLowerCase()} con código *${e.tracking}*. Ya va en camino con nuestro mensajero ${e.mensajero_nombre || ''}.`;
        } else if (estado === 'ENTREGADO') {
            msgRem = `✅ *OrbitM7 · Mensajería*\nTu envío ${ref} fue entregado el ${fmtFecha(e.fecha_entrega_real || new Date())}.\nRecibió: ${e.receptor_nombre || e.destinatario_nombre}.`;
            msgDest = `✅ *Milla 7*\nConfirmamos la entrega del envío *${e.tracking}* el ${fmtFecha(e.fecha_entrega_real || new Date())}. Recibió: ${e.receptor_nombre || e.destinatario_nombre}. ¡Gracias!`;
        } else if (estado === 'FALLIDO') {
            msgRem = `⚠️ *OrbitM7 · Mensajería*\nNo se pudo entregar tu envío ${ref}.\nMotivo: ${motivo || 'sin detalle'}.\nGestión Humana coordinará un nuevo intento.`;
            msgDest = `⚠️ *Milla 7*\nHola ${e.destinatario_nombre}, intentamos entregarte el envío *${e.tracking}* pero no fue posible (${motivo || 'sin detalle'}). Te contactaremos para un nuevo intento.`;
        } else {
            return;
        }
        await sendWa(e.remitente_telefono, msgRem);
        await sendWa(e.destinatario_telefono, msgDest);
    } catch (err: any) {
        console.warn('[GH-MENSAJERIA] notificarCambioEstado:', err.message);
    }
}

/**
 * Genera y resuelve alertas. ATRASADO: envío abierto con más de HORAS_ALERTA_ATRASO horas.
 * SIN_ASIGNAR: pendiente sin mensajero por más de HORAS_SIN_ASIGNAR horas. FALLIDO: envío en FALLIDO.
 * Notifica por WhatsApp al remitente y al destinatario solo las alertas ATRASADO nuevas.
 */
export async function procesarAlertas(): Promise<{ nuevas: number; resueltas: number }> {
    const resueltas = await pool.query(`
        UPDATE gh_mensajeria_alertas a SET resuelta = TRUE, resuelta_at = CURRENT_TIMESTAMP
        FROM gh_mensajeria_envios e
        WHERE a.envio_id = e.id AND a.resuelta = FALSE AND (
            e.estado_id IN ('${ID.ENTREGADO}','${ID.DEVUELTO}','${ID.CANCELADO}')
            OR (a.tipo = 'SIN_ASIGNAR' AND e.estado_id <> '${ID.PENDIENTE}')
            OR (a.tipo = 'FALLIDO' AND e.estado_id <> '${ID.FALLIDO}')
        )`);

    const nuevas = await pool.query(`
        INSERT INTO gh_mensajeria_alertas (envio_id, tipo, detalle)
        SELECT e.id, x.tipo, x.detalle
        FROM gh_mensajeria_envios e
        CROSS JOIN LATERAL (VALUES
            (CASE WHEN e.estado_id IN (${idsSql(ESTADOS_ABIERTOS)})
                   AND e.created_at <= NOW() - make_interval(hours => $1::int) THEN 'ATRASADO' END,
             'Más de ' || $1::int || ' horas sin entregar'),
            (CASE WHEN e.estado_id = '${ID.PENDIENTE}'
                   AND e.created_at <= NOW() - make_interval(hours => $2::int) THEN 'SIN_ASIGNAR' END,
             'Más de ' || $2::int || ' horas sin mensajero'),
            (CASE WHEN e.estado_id = '${ID.FALLIDO}' THEN 'FALLIDO' END, 'Entrega fallida pendiente de gestión')
        ) AS x(tipo, detalle)
        WHERE x.tipo IS NOT NULL
        ON CONFLICT (envio_id, tipo) WHERE resuelta = FALSE DO NOTHING
        RETURNING id`, [HORAS_ALERTA_ATRASO, HORAS_SIN_ASIGNAR]);

    const pendientes = await pool.query(`
        SELECT a.id, a.envio_id FROM gh_mensajeria_alertas a
        WHERE a.tipo = 'ATRASADO' AND a.resuelta = FALSE AND a.notificada = FALSE`);
    for (const a of pendientes.rows) {
        const e = await cargarEnvio(a.envio_id);
        if (e) {
            await sendWa(e.remitente_telefono,
                `⏰ *OrbitM7 · Mensajería*\nTu envío *${e.tracking}* para ${e.destinatario_nombre} lleva más de ${HORAS_ALERTA_ATRASO} h sin entregarse (estado: ${e.estado_nombre}). Gestión Humana ya fue alertada.`);
            await sendWa(e.destinatario_telefono,
                `⏰ *Milla 7*\nHola ${e.destinatario_nombre}, tu envío *${e.tracking}* presenta un retraso. Estamos gestionando la entrega lo antes posible.`);
        }
        await pool.query(`UPDATE gh_mensajeria_alertas SET notificada = TRUE WHERE id = $1`, [a.id]);
    }

    if (nuevas.rowCount || resueltas.rowCount) {
        console.log(`[GH-MENSAJERIA] Alertas: ${nuevas.rowCount} nuevas, ${resueltas.rowCount} resueltas`);
    }
    return { nuevas: nuevas.rowCount || 0, resueltas: resueltas.rowCount || 0 };
}

export function startMensajeriaCron(): void {
    // Reintentos de subida a Drive (todos los entornos: sin esto los archivos quedan solo en la cola local)
    cron.schedule('*/5 * * * *', () => { processUploadQueue().catch(() => {}); }, { timezone: 'America/Bogota' });
    // Alertas de envíos atrasados, cada hora en punto
    cron.schedule('0 * * * *', () => {
        procesarAlertas().catch(err => console.error('[GH-MENSAJERIA] procesarAlertas:', err.message));
    }, { timezone: 'America/Bogota' });
    console.log(`[GH-MENSAJERIA] Cron iniciado — cola Drive cada 5 min, alertas cada hora (WhatsApp ${WA_ENABLED ? 'activo' : 'deshabilitado'})`);
}
