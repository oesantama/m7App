import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getNotificacionesWhatsapp = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notificaciones_whatsapp ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const saveNotificacionWhatsapp = async (req: Request, res: Response) => {
  const { id, user_id, phone, tipo_notificacion_id, status_id, createdBy, updatedBy } = req.body;
  const userIdCamel = req.body.userId || user_id;
  const tipoNotificacionIdCamel = req.body.tipoNotificacionId || tipo_notificacion_id;
  const statusIdCamel = req.body.statusId || status_id;
  const phoneValue = req.body.phone || phone;

  try {
    // Determine if it's an update or insert
    const checkRes = await pool.query('SELECT id FROM notificaciones_whatsapp WHERE id = $1', [id]);
    
    if (checkRes.rowCount && checkRes.rowCount > 0) {
      // UPDATE
      const updateRes = await pool.query(
        `UPDATE notificaciones_whatsapp 
         SET user_id = $1, phone = $2, tipo_notificacion_id = $3, status_id = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING *`,
        [userIdCamel, phoneValue, tipoNotificacionIdCamel, statusIdCamel, id]
      );
      res.json(updateRes.rows[0]);
    } else {
      // INSERT
      const insertRes = await pool.query(
        `INSERT INTO notificaciones_whatsapp (id, user_id, phone, tipo_notificacion_id, status_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, userIdCamel, phoneValue, tipoNotificacionIdCamel, statusIdCamel]
      );
      res.json(insertRes.rows[0]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteNotificacionWhatsapp = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM notificaciones_whatsapp WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
