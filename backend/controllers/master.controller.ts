
import { Request, Response } from 'express';
import pool from '../config/database.js';


export const getMasters = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM master_records ORDER BY category, name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-MASTERS] Error getting masters:', err);
    res.status(500).json({ error: "Error al obtener maestros" });
  }
};

export const saveMasterRecord = async (req: Request, res: Response) => {
  const { category } = req.params;
  const r = req.body;

  try {
    // Verificar que categoría existe en la tabla (opcional, pero buena práctica)
    // Para simplificar, asumimos que 'category' coincide con la columna 'category' en master_records

    const result = await pool.query(`
      INSERT INTO master_records (id, category, name, description, parent_id, notification_email, icon_class, status_id, tipo_notificacion_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
      name = $3, description = $4, parent_id = $5, notification_email = $6, icon_class = $7, status_id = $8, tipo_notificacion_id = $9, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [r.id, category, r.name, r.description, r.parentId, r.notificationEmail, r.iconClass, r.statusId, r.tipoNotificacionId || r.tipo_notificacion_id || null]);

    res.json({ success: true, message: 'Registro maestro guardado correctamente', record: result.rows[0] });
  } catch (err: any) {
    console.error(`[M7-MASTERS] Error saving to ${category}:`, err);
    res.status(500).json({ error: "Error al guardar registro maestro" });
  }
};

export const deleteMasterRecord = async (req: Request, res: Response) => {
  const { category, id } = req.params;
  const { deletedBy } = req.query;

  try {
    // Auditoría: Obtener el registro antes de borrar
    const record = await pool.query('SELECT * FROM master_records WHERE id = $1 AND category = $2', [id, category]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        [`master:${category}`, id, record.rows[0], deletedBy || 'Unknown']
      );
    }

    const result = await pool.query('DELETE FROM master_records WHERE id = $1 AND category = $2 RETURNING id', [id, category]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro no encontrado en esta categoría" });
    }

    res.json({ success: true, message: 'Registro maestro eliminado y auditado' });
  } catch (err: any) {
    console.error(`[M7-MASTERS] Error deleting from ${category}:`, err);
    res.status(500).json({ error: "Error al eliminar registro maestro" });
  }
};
