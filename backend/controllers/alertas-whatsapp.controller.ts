import { Request, Response } from 'express';
import pool from '../config/database.js';
import { whatsappCronRunner } from '../services/whatsapp-cron.service.js';

export const getAlertasWhatsapp = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.description, a.message_template,
             a.cron_expression, a.tipo_evento, a.adjunto_tipo, a.status_id, a.client_id,
             a.last_run, a.next_run, a.created_by, a.updated_by, a.created_at, a.updated_at,
             COALESCE(
               (SELECT json_agg(
                          json_build_object('id', d.id, 'phone_number', d.phone_number, 'enabled', d.enabled, 'email', d.email)
                          ORDER BY d.created_at ASC
                        )
                FROM alertas_whatsapp_destinatarios d
                WHERE d.alerta_id = a.id),
               '[]'
             ) AS destinatarios
      FROM alertas_whatsapp a
      ORDER BY a.name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[WA-ALERTAS] getAlertasWhatsapp error:', err);
    res.status(500).json({ success: false, error: 'Error al obtener alertas WhatsApp' });
  }
};

interface DestinatarioInput {
  id?: number;
  phone_number: string;
  enabled: boolean;
}

export const saveAlertaWhatsapp = async (req: Request, res: Response) => {
  const a = req.body;
  const client = await pool.connect();
  try {
    if (!a.name?.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    }
    if (!a.id) {
      return res.status(400).json({ success: false, error: 'El ID es requerido' });
    }

    const destinatarios: DestinatarioInput[] = Array.isArray(a.destinatarios)
      ? a.destinatarios
          .map((d: any) => ({ id: d.id, phone_number: String(d.phone_number || '').replace(/\D/g, ''), enabled: !!d.enabled }))
          .filter((d: DestinatarioInput) => d.phone_number.length >= 10)
      : [];

    await client.query('BEGIN');

    await client.query(`
      INSERT INTO alertas_whatsapp
        (id, name, description, message_template,
         cron_expression, tipo_evento, adjunto_tipo, status_id, client_id, created_by, updated_by,
         created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name             = $2,
        description      = $3,
        message_template = $4,
        cron_expression  = $5,
        tipo_evento      = $6,
        adjunto_tipo     = $7,
        status_id        = $8,
        client_id        = $9,
        updated_by       = $11,
        updated_at       = NOW()
    `, [
      a.id,
      a.name.trim(),
      a.description || '',
      a.messageTemplate || '',
      a.cronExpression || '0 8 * * 1-5',
      a.tipoEvento || 'MANUAL',
      a.adjuntoTipo || 'ninguno',
      a.statusId || 'EST-01',
      a.clientId || null,
      a.createdBy || a.updatedBy || 'System',
      a.updatedBy || 'System',
    ]);

    // Diff-sync de destinatarios: se borran los que ya no vienen en la lista, se actualiza
    // enabled/teléfono de los que traen id, y se insertan los nuevos (sin id).
    const existingRes = await client.query(
      'SELECT id FROM alertas_whatsapp_destinatarios WHERE alerta_id = $1',
      [a.id]
    );
    const existingIds: number[] = existingRes.rows.map(r => r.id);
    const incomingIds = destinatarios.filter(d => d.id).map(d => d.id as number);
    const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

    if (idsToDelete.length > 0) {
      await client.query(
        'DELETE FROM alertas_whatsapp_destinatarios WHERE id = ANY($1::int[])',
        [idsToDelete]
      );
    }

    for (const d of destinatarios) {
      if (d.id) {
        await client.query(
          `UPDATE alertas_whatsapp_destinatarios SET phone_number = $1, enabled = $2, updated_at = NOW() WHERE id = $3`,
          [d.phone_number, d.enabled, d.id]
        );
      } else {
        await client.query(
          `INSERT INTO alertas_whatsapp_destinatarios (alerta_id, phone_number, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (alerta_id, phone_number) DO UPDATE SET enabled = $3, updated_at = NOW()`,
          [a.id, d.phone_number, d.enabled]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Alerta WhatsApp guardada' });
    whatsappCronRunner.reload().catch(() => {}); // recarga crons sin bloquear
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[WA-ALERTAS] saveAlertaWhatsapp error:', err);
    res.status(500).json({ success: false, error: 'Error al guardar alerta WhatsApp' });
  } finally {
    client.release();
  }
};

export const deleteAlertaWhatsapp = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM alertas_whatsapp WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
    }
    res.json({ success: true, message: 'Alerta WhatsApp eliminada' });
    whatsappCronRunner.reload().catch(() => {});
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Error al eliminar alerta WhatsApp' });
  }
};

export const sendTestAlerta = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM alertas_whatsapp WHERE id = $1',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
    }
    const alerta = result.rows[0];

    const destRes = await pool.query(
      'SELECT COUNT(*)::int AS c FROM alertas_whatsapp_destinatarios WHERE alerta_id = $1 AND enabled = true',
      [id]
    );
    if (destRes.rows[0].c === 0) {
      return res.status(400).json({ success: false, error: 'La alerta no tiene destinatarios habilitados' });
    }

    const sent = await whatsappCronRunner.sendAlerta(alerta, true);

    res.json({ success: true, message: `Prueba enviada a ${sent} número(s)` });
  } catch (err: any) {
    console.error('[WA-ALERTAS] sendTestAlerta error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar prueba' });
  }
};
