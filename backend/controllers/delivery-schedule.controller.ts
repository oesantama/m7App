import { Request, Response } from 'express';
import pool from '../config/database.js';

// GET /delivery-schedules?clientId=xxx[&dayOfWeek=1]
export const getDeliverySchedules = async (req: Request, res: Response) => {
  const { clientId, dayOfWeek } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  try {
    const params: any[] = [String(clientId)];
    let where = 'WHERE client_id = $1';
    if (dayOfWeek !== undefined) {
      params.push(Number(dayOfWeek));
      where += ` AND day_of_week = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT id, client_id, customer_key, customer_name, city,
              day_of_week, close_time, label, created_at, updated_at
       FROM delivery_schedules ${where}
       ORDER BY customer_name, day_of_week`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-SCHED-GET]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /delivery-schedules  — upsert (crear o actualizar)
export const upsertDeliverySchedule = async (req: Request, res: Response) => {
  const { clientId, customerName, city, dayOfWeek, closeTime, label } = req.body;
  if (!clientId || customerName === undefined || dayOfWeek === undefined || !closeTime) {
    return res.status(400).json({ error: 'clientId, customerName, dayOfWeek y closeTime son requeridos' });
  }
  if (Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) {
    return res.status(400).json({ error: 'dayOfWeek debe ser 0-6' });
  }
  // Validate HH:MM format
  if (!/^\d{1,2}:\d{2}$/.test(String(closeTime))) {
    return res.status(400).json({ error: 'closeTime debe tener formato HH:MM' });
  }

  const customerKey = `${String(customerName).toLowerCase().trim()}|${String(city || '').toLowerCase().trim()}`;

  try {
    const result = await pool.query(`
      INSERT INTO delivery_schedules (client_id, customer_key, customer_name, city, day_of_week, close_time, label, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (client_id, customer_key, day_of_week) DO UPDATE SET
        close_time    = EXCLUDED.close_time,
        label         = EXCLUDED.label,
        customer_name = EXCLUDED.customer_name,
        city          = EXCLUDED.city,
        updated_at    = NOW()
      RETURNING *
    `, [clientId, customerKey, String(customerName).toUpperCase().trim(), String(city || '').toUpperCase().trim(), Number(dayOfWeek), String(closeTime), label || null]);
    res.json({ success: true, schedule: result.rows[0] });
  } catch (err: any) {
    console.error('[M7-SCHED-UPSERT]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// DELETE /delivery-schedules/:id
export const deleteDeliverySchedule = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM delivery_schedules WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Horario no encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[M7-SCHED-DEL]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// DELETE /delivery-schedules  — borrar todos los de un cliente (reset)
export const deleteAllDeliverySchedules = async (req: Request, res: Response) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  try {
    const r = await pool.query('DELETE FROM delivery_schedules WHERE client_id = $1', [String(clientId)]);
    res.json({ success: true, deleted: r.rowCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
