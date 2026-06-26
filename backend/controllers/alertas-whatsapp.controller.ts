import { Request, Response } from 'express';
import pool from '../config/database.js';
import { whatsappCronRunner } from '../services/whatsapp-cron.service.js';

export const getAlertasWhatsapp = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, phone_numbers, message_template,
             cron_expression, tipo_evento, adjunto_tipo, status_id, client_id,
             last_run, next_run, created_by, updated_by, created_at, updated_at
      FROM alertas_whatsapp
      ORDER BY name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[WA-ALERTAS] getAlertasWhatsapp error:', err);
    res.status(500).json({ success: false, error: 'Error al obtener alertas WhatsApp' });
  }
};

export const saveAlertaWhatsapp = async (req: Request, res: Response) => {
  const a = req.body;
  try {
    if (!a.name?.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    }
    if (!a.id) {
      return res.status(400).json({ success: false, error: 'El ID es requerido' });
    }

    const phones: string[] = Array.isArray(a.phoneNumbers)
      ? a.phoneNumbers.map((p: string) => p.replace(/\D/g, ''))
          .filter((p: string) => p.length >= 10)
      : [];

    await pool.query(`
      INSERT INTO alertas_whatsapp
        (id, name, description, phone_numbers, message_template,
         cron_expression, tipo_evento, adjunto_tipo, status_id, client_id, created_by, updated_by,
         created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name             = $2,
        description      = $3,
        phone_numbers    = $4,
        message_template = $5,
        cron_expression  = $6,
        tipo_evento      = $7,
        adjunto_tipo     = $8,
        status_id        = $9,
        client_id        = $10,
        updated_by       = $12,
        updated_at       = NOW()
    `, [
      a.id,
      a.name.trim(),
      a.description || '',
      phones,
      a.messageTemplate || '',
      a.cronExpression || '0 8 * * 1-5',
      a.tipoEvento || 'MANUAL',
      a.adjuntoTipo || 'ninguno',
      a.statusId || 'EST-01',
      a.clientId || null,
      a.createdBy || a.updatedBy || 'System',
      a.updatedBy || 'System',
    ]);

    res.json({ success: true, message: 'Alerta WhatsApp guardada' });
    whatsappCronRunner.reload().catch(() => {}); // recarga crons sin bloquear
  } catch (err: any) {
    console.error('[WA-ALERTAS] saveAlertaWhatsapp error:', err);
    res.status(500).json({ success: false, error: 'Error al guardar alerta WhatsApp' });
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
    const phones: string[] = alerta.phone_numbers || [];
    if (phones.length === 0) {
      return res.status(400).json({ success: false, error: 'La alerta no tiene destinatarios configurados' });
    }

    const sent = await whatsappCronRunner.sendAlerta(alerta, true);

    res.json({ success: true, message: `Prueba enviada a ${sent} número(s)` });
  } catch (err: any) {
    console.error('[WA-ALERTAS] sendTestAlerta error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar prueba' });
  }
};
