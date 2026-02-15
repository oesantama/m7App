import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUnidadesMedida = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM unidades_medida ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-UNIDADES] Error:', err);
    res.status(500).json({ error: "Error al obtener unidades de medida" });
  }
};

export const saveUnidadMedida = async (req: Request, res: Response) => {
  const u = req.body;
  try {
    await pool.query(`
      INSERT INTO unidades_medida (id, name, description, abbreviation, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, abbreviation = $4, status_id = $5, updated_by = $7, updated_at = CURRENT_TIMESTAMP
    `, [u.id, u.name, u.description, u.abbreviation, u.statusId, u.createdBy || u.updatedBy || 'System', u.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Unidad de medida guardada' });
  } catch (err: any) {
    console.error('[M7-UNIDADES] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar unidad de medida" });
  }
};

export const deleteUnidadMedida = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM unidades_medida WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Unidad de medida no encontrada" });
    
    res.json({ success: true, message: 'Unidad de medida eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar unidad de medida", details: err.detail || err.message });
  }
};
