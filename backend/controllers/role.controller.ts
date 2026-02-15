
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-ROLES] Database connection failed');
    res.json([]); 
  }
};

export const saveRole = async (req: Request, res: Response) => {
  const r = req.body;
  try {
    await pool.query(`
      INSERT INTO roles (id, name, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, status_id = $3, updated_by = $4, updated_at = CURRENT_TIMESTAMP
    `, [r.id, r.name, r.statusId, r.createdBy || r.updatedBy || 'System']);
    res.json({ success: true, message: 'Rol guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el rol" });
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  try {
    const record = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['roles', id, record.rows[0], deletedBy || 'Unknown']
      );
    }
    const result = await pool.query('DELETE FROM roles WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Rol no encontrado" });
    res.json({ success: true, message: 'Rol eliminado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar el rol" });
  }
};
