
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getPages = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, route, 
        module_id AS "moduleId", 
        parent_id AS "parentId", 
        status_id AS "statusId" 
      FROM pages 
      ORDER BY name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[PAGES-ERROR]', err);
    res.json([]);
  }
};

export const savePage = async (req: Request, res: Response) => {
  const p = req.body;
  try {
    await pool.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, route = $3, module_id = $4, parent_id = $5, status_id = $6, updated_by = $7, updated_at = CURRENT_TIMESTAMP
    `, [p.id, p.name, p.route, p.moduleId, p.parentId, p.statusId, p.createdBy || p.updatedBy || 'System']);
    res.json({ success: true, message: 'Página guardada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar la página" });
  }
};

export const deletePage = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const record = await pool.query('SELECT * FROM pages WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['pages', id, record.rows[0], 'Admin']
      );
    }
    await pool.query('DELETE FROM pages WHERE id = $1', [id]);
    res.json({ success: true, message: 'Página eliminada' });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar la página" });
  }
};
