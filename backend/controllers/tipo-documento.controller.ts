import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getTiposDocumento = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_documento ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-TIPOS-DOC] Error:', err);
    res.status(500).json({ error: "Error al obtener tipos de documento" });
  }
};

export const saveTipoDocumento = async (req: Request, res: Response) => {
  const t = req.body;
  try {
    await pool.query(`
      INSERT INTO tipos_documento (id, name, description, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, status_id = $4, updated_by = $6, updated_at = CURRENT_TIMESTAMP
    `, [t.id, t.name, t.description, t.statusId, t.createdBy || t.updatedBy || 'System', t.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Tipo de documento guardado' });
  } catch (err: any) {
    console.error('[M7-TIPOS-DOC] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar tipo de documento" });
  }
};

export const deleteTipoDocumento = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM tipos_documento WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Tipo de documento no encontrado" });
    
    res.json({ success: true, message: 'Tipo de documento eliminado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar tipo de documento", details: err.detail || err.message });
  }
};
