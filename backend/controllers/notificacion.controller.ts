import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getNotificaciones = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notificaciones ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-NOTIF] Error:', err);
    res.status(500).json({ error: "Error al obtener notificaciones" });
  }
};

export const saveNotificacion = async (req: Request, res: Response) => {
  const n = req.body;
  try {
    await pool.query(`
      INSERT INTO notificaciones (id, name, description, notification_email, tipo_notificacion_id, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, notification_email = $4, tipo_notificacion_id = $5, status_id = $6, updated_by = $8, updated_at = CURRENT_TIMESTAMP
    `, [n.id, n.name, n.description, n.notificationEmail, n.tipoNotificacionId, n.statusId, n.createdBy || n.updatedBy || 'System', n.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Notificación guardada' });
  } catch (err: any) {
    console.error('[M7-NOTIF] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar notificación" });
  }
};

export const deleteNotificacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM notificaciones WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Notificación no encontrada" });
    
    res.json({ success: true, message: 'Notificación eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar notificación", details: err.detail || err.message });
  }
};
