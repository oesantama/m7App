import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getEstados = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM estados ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-ESTADOS] Error:', err);
    res.status(500).json({ error: "Error al obtener estados" });
  }
};

export const saveEstado = async (req: Request, res: Response) => {
  const e = req.body;
  try {
    await pool.query(`
      INSERT INTO estados (id, name, description, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, status_id = $4, updated_by = $6, updated_at = CURRENT_TIMESTAMP
    `, [e.id, e.name, e.description, e.statusId, e.createdBy || e.updatedBy || 'System', e.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Estado guardado' });
  } catch (err: any) {
    console.error('[M7-ESTADOS] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar estado" });
  }
};

export const deleteEstado = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  
  try {
    const result = await pool.query('DELETE FROM estados WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Estado no encontrado" });
    
    res.json({ success: true, message: 'Estado eliminado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar estado", details: err.detail || err.message });
  }
};
