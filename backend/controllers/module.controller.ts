
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getModules = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, name, icon_class AS "iconClass", status_id AS "statusId",
      created_at AS "createdAt", updated_at AS "updatedAt", created_by AS "createdBy", updated_by AS "updatedBy"
      FROM modules 
      ORDER BY name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[MODULES-ERROR]', err);
    res.json([]);
  }
};

export const saveModule = async (req: Request, res: Response) => {
  const m = req.body;
  try {
    await pool.query(`
      INSERT INTO modules (id, name, icon_class, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, icon_class = $3, status_id = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
    `, [m.id, m.name, m.iconClass, m.statusId, m.createdBy || m.updatedBy || 'System']);
    res.json({ success: true, message: 'Módulo guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el módulo" });
  }
};

export const deleteModule = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const record = await pool.query('SELECT * FROM modules WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['modules', id, record.rows[0], 'Admin']
      );
    }
    await pool.query('DELETE FROM modules WHERE id = $1', [id]);
    res.json({ success: true, message: 'Módulo eliminado' });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar el módulo" });
  }
};
