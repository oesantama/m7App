import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getMarcas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM marcas ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-MARCAS] Error:', err);
    res.status(500).json({ error: "Error al obtener marcas" });
  }
};

export const saveMarca = async (req: Request, res: Response) => {
  const m = req.body;
  try {
    await pool.query(`
      INSERT INTO marcas (id, name, description, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, status_id = $4, updated_by = $6, updated_at = CURRENT_TIMESTAMP
    `, [m.id, m.name, m.description, m.statusId, m.createdBy || m.updatedBy || 'System', m.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Marca guardada' });
  } catch (err: any) {
    console.error('[M7-MARCAS] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar marca" });
  }
};

export const deleteMarca = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM marcas WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Marca no encontrada" });
    
    res.json({ success: true, message: 'Marca eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar marca", details: err.detail || err.message });
  }
};
