
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
  // M7 BLINDAJE: Validar ID obligatorio
  if (!r.id || String(r.id).trim() === '') {
    console.error(`[M7-MASTER-ERROR] Intento de guardado sin ID en categoría ${category}:`, r);
    return res.status(400).json({ success: false, error: 'El ID es obligatorio para registros maestros.' });
  }

  // M7 BLINDAJE: Asegurar que los campos opcionales sean null si vienen undefined
  const id = r.id;
  const name = r.name;
  const description = r.description || null;
  const parentId = r.parentId || r.parent_id || null;
  const notificationEmail = r.notificationEmail || r.notification_email || null;
  const iconClass = r.iconClass || r.icon_class || null;
  const statusId = r.statusId || r.status_id || 'EST-01';
  const tipoNotificacionId = r.tipo_notificacion_id || r.tipoNotificacionId || null;
  const createdBy = r.createdBy || r.updatedBy || 'System';
  const updatedBy = r.updatedBy || r.createdBy || 'System';

  try {
    const result = await pool.query(`
      INSERT INTO master_records (id, category, name, description, parent_id, notification_email, icon_class, status_id, tipo_notificacion_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $3, description = $4, parent_id = $5, notification_email = $6, icon_class = $7, status_id = $8, tipo_notificacion_id = $9, updated_by = $11, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [id, category, name, description, parentId, notificationEmail, iconClass, statusId, tipoNotificacionId, createdBy, updatedBy]);

    res.json({ success: true, message: 'Registro maestro guardado correctamente', record: result.rows[0] });
  } catch (err: any) {
    console.error(`-------------------------------------------`);
    console.error(`[M7-MASTERS-ERROR] Falló guardado en ${category}`);
    console.error(`Mensaje:`, err.message);
    console.error(`Detalles:`, err.detail);
    console.error(`Payload:`, { id, category, name, statusId });
    console.error(`-------------------------------------------`);
    res.status(500).json({ 
        error: "Error al guardar registro maestro", 
        details: err.message,
        category: category
    });
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
