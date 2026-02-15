
import { Request, Response } from 'express';
import pool from '../config/database.js';

// Helper to generate next ID: CAT-001, CAT-002...
const generateNextId = async (): Promise<string> => {
    const res = await pool.query("SELECT id FROM categories WHERE id LIKE 'CAT-%' ORDER BY id DESC LIMIT 1");
    if (res.rows.length === 0) return 'CAT-001';
    
    const lastId = res.rows[0].id; // e.g. CAT-015
    const numPart = parseInt(lastId.replace('CAT-', ''), 10);
    const nextNum = isNaN(numPart) ? 1 : numPart + 1;
    
    return `CAT-${String(nextNum).padStart(3, '0')}`;
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CATEGORIES-ERROR]', err);
    res.json([]);
  }
};

export const saveCategory = async (req: Request, res: Response) => {
  const c = req.body;
  
  try {
    let finalId = c.id;
    // Generate ID if new
    if (!finalId) {
        finalId = await generateNextId();
    }

    await pool.query(`
      INSERT INTO categories (id, name, description, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, status_id = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
    `, [finalId, c.name, c.description, c.statusId || 'EST-01', c.createdBy || c.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Categoría guardada', id: finalId });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar la categoría" });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;

  try {
    const record = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['categories', id, record.rows[0], deletedBy || 'Admin']
      );
    }
    await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar la categoría" });
  }
};
