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
                          json_build_object('id', d.id, 'nombre', d.nombre, 'phone_number', d.phone_number,
                                            'enabled', d.enabled, 'email', d.email, 'canal', d.canal,
                                            'alcance', d.alcance, 'client_ids', d.client_ids)
                          ORDER BY d.created_at ASC, d.id ASC
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
  nombre: string | null;
  phone_number: string | null;
  enabled: boolean;
  email: string | null;
  canal: 'WHATSAPP' | 'EMAIL' | 'AMBOS';
  alcance: 'GENERAL' | 'CLIENTE';
  client_ids: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza y valida un destinatario. Devuelve el mensaje de error o null. */
function normalizarDestinatario(d: any, i: number): { dest: DestinatarioInput; error: string | null } {
  const phone = String(d.phone_number || '').replace(/\D/g, '');
  const email = d.email ? String(d.email).trim().toLowerCase() : '';
  const canal = ['WHATSAPP', 'EMAIL', 'AMBOS'].includes(d.canal) ? d.canal : 'AMBOS';
  const alcance = d.alcance === 'CLIENTE' ? 'CLIENTE' : 'GENERAL';
  const clientIds = Array.isArray(d.client_ids)
    ? [...new Set(d.client_ids.map((c: any) => String(c).trim()).filter(Boolean))] as string[]
    : [];
  const dest: DestinatarioInput = {
    id: d.id ? Number(d.id) : undefined,
    nombre: d.nombre ? String(d.nombre).trim().slice(0, 120) : null,
    phone_number: phone || null,
    enabled: d.enabled !== false,
    email: email || null,
    canal,
    alcance,
    client_ids: alcance === 'CLIENTE' ? clientIds : [],
  };
  const quien = dest.nombre || dest.phone_number || dest.email || `#${i + 1}`;
  let error: string | null = null;
  if (canal !== 'EMAIL' && (!phone || phone.length < 10)) error = `${quien}: el celular es obligatorio para WhatsApp (mínimo 10 dígitos).`;
  else if (canal !== 'WHATSAPP' && !email) error = `${quien}: el correo es obligatorio para envío por correo.`;
  else if (email && !EMAIL_RE.test(email)) error = `${quien}: correo inválido.`;
  else if (alcance === 'CLIENTE' && clientIds.length === 0) error = `${quien}: seleccione al menos un cliente.`;
  return { dest, error };
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

    const normalizados = (Array.isArray(a.destinatarios) ? a.destinatarios : []).map(normalizarDestinatario);
    const errorDest = normalizados.find((n: { error: string | null }) => n.error)?.error;
    if (errorDest) {
      return res.status(400).json({ success: false, error: errorDest });
    }
    const destinatarios: DestinatarioInput[] = normalizados.map((n: { dest: DestinatarioInput }) => n.dest);
    const claves = destinatarios.map(d => d.phone_number || `@${d.email}`);
    const repetido = claves.find((k, i) => claves.indexOf(k) !== i);
    if (repetido) {
      return res.status(400).json({ success: false, error: `Destinatario repetido: ${repetido.replace(/^@/, '')}. Si necesita varios clientes, selecciónelos en el mismo destinatario.` });
    }

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
      const vals = [d.nombre, d.phone_number, d.enabled, d.email, d.canal, d.alcance, d.client_ids];
      if (d.id && existingIds.includes(d.id)) {
        await client.query(
          `UPDATE alertas_whatsapp_destinatarios
           SET nombre = $1, phone_number = $2, enabled = $3, email = $4, canal = $5, alcance = $6, client_ids = $7,
               updated_at = NOW()
           WHERE id = $8 AND alerta_id = $9`,
          [...vals, d.id, a.id]
        );
      } else {
        await client.query(
          `INSERT INTO alertas_whatsapp_destinatarios (alerta_id, nombre, phone_number, enabled, email, canal, alcance, client_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [a.id, ...vals]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Alerta WhatsApp guardada' });
    whatsappCronRunner.reload().catch(() => {}); // recarga crons sin bloquear
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'Hay un destinatario repetido (mismo celular o correo) en esta alerta.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ success: false, error: 'Revise los destinatarios: falta celular o correo según el canal, o el cliente.' });
    }
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

    const r = await whatsappCronRunner.sendAlerta(alerta, true);
    const partes = [`${r.whatsapp} WhatsApp`, `${r.email} correo(s)`];
    if (r.omitidos) partes.push(`${r.omitidos} sin datos para su cliente`);
    const message = `Prueba enviada: ${partes.join(', ')}.` + (r.errores.length ? ` Advertencias: ${r.errores.slice(0, 2).join(' | ')}` : '');

    res.json({ success: true, message, data: r });
  } catch (err: any) {
    console.error('[WA-ALERTAS] sendTestAlerta error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar prueba' });
  }
};
