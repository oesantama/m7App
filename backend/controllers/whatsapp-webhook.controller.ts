import { Request, Response } from 'express';
import pool from '../config/database.js';

// Mapa de códigos de estado de Baileys (motor detrás de Evolution API) a texto legible.
// 0=ERROR 1=PENDING 2=SERVER_ACK(enviado al servidor) 3=DELIVERY_ACK(entregado al teléfono) 4=READ 5=PLAYED
const STATUS_MAP: Record<number, string> = {
    0: 'ERROR',
    1: 'PENDING',
    2: 'SERVER_ACK',
    3: 'DELIVERED',
    4: 'READ',
    5: 'PLAYED',
};

// Evolution API (según versión) puede mandar `data` como objeto único o como arreglo —
// normalizamos siempre a un arreglo para procesar de forma uniforme.
function normalizeEntries(body: any): any[] {
    const data = body?.data ?? body;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data];
    return [];
}

function extractMessageId(entry: any): string | null {
    return entry?.key?.id || entry?.keyId || entry?.id || null;
}

function extractStatus(entry: any): string | null {
    const raw = entry?.update?.status ?? entry?.status;
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number') return STATUS_MAP[raw] || `CODE_${raw}`;
    return String(raw).toUpperCase();
}

// ─── POST /whatsapp/webhook/:instance (público — llamado por Evolution API) ───
export const recibirWebhook = async (req: Request, res: Response) => {
    const { instance } = req.params;
    const eventType = req.body?.event || 'unknown';

    // Confirmamos recepción de inmediato — Evolution no debe esperar a que terminemos de procesar.
    res.status(200).json({ received: true });

    try {
        const entries = normalizeEntries(req.body);

        for (const entry of entries) {
            const externalMessageId = extractMessageId(entry);
            const status = extractStatus(entry);

            await pool.query(
                `INSERT INTO whatsapp_delivery_events (instance_name, external_message_id, event_type, status, raw_payload)
                 VALUES ($1, $2, $3, $4, $5)`,
                [instance, externalMessageId, eventType, status, JSON.stringify(req.body)]
            );

            if (externalMessageId && status) {
                await pool.query(
                    `UPDATE whatsapp_logs SET status = $1 WHERE external_message_id = $2`,
                    [status, externalMessageId]
                );
            }
        }
    } catch (error: any) {
        console.error(`[WA-WEBHOOK] Error procesando evento de ${instance}:`, error.message);
    }
};
