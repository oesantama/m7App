import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getTiposVehiculo = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_vehiculo ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-TIPOS-VEH] Error:', err);
    res.status(500).json({ error: "Error al obtener tipos de vehículo" });
  }
};

export const saveTipoVehiculo = async (req: Request, res: Response) => {
  const t = req.body;
  try {
    await pool.query(`
      INSERT INTO tipos_vehiculo (id, name, description, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, description = $3, status_id = $4, updated_by = $6, updated_at = CURRENT_TIMESTAMP
    `, [t.id, t.name, t.description, t.statusId, t.createdBy || t.updatedBy || 'System', t.updatedBy || 'System']);
    
    res.json({ success: true, message: 'Tipo de vehículo guardado' });
  } catch (err: any) {
    console.error('[M7-TIPOS-VEH] Error guardando:', err);
    res.status(500).json({ error: "Error al guardar tipo de vehículo" });
  }
};

export const deleteTipoVehiculo = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM tipos_vehiculo WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Tipo de vehículo no encontrado" });
    
    res.json({ success: true, message: 'Tipo de vehículo eliminado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar tipo de vehículo", details: err.detail || err.message });
  }
};
