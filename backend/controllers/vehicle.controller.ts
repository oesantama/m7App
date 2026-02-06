
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getVehicles = async (req: Request, res: Response) => {
  try {
    // Reparación de esquema bajo demanda
    await pool.query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_year TEXT;');
    await pool.query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color TEXT;');
    await pool.query('ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_type TEXT;');
    
    // Filtrar eliminados (Soft Delete)
    const result = await pool.query("SELECT * FROM vehicles WHERE status_id != 'ELIMINADO' ORDER BY plate ASC");
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-VEHICLES] Error fetching or repairing schema:', err.message);
    res.json([]); 
  }
};

export const saveVehicle = async (req: Request, res: Response) => {
  const v = req.body;
  try {
    await pool.query(`
      INSERT INTO vehicles (
        id, plate, brand, owner, capacity_m3, client_id, 
        soat_expiry, techno_expiry, status_id,
        soat_pdf, techno_pdf, model_year, color, vehicle_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        plate = $2, brand = $3, owner = $4, capacity_m3 = $5, client_id = $6, 
        soat_expiry = $7, techno_expiry = $8, status_id = $9,
        soat_pdf = $10, techno_pdf = $11, model_year = $12, color = $13, vehicle_type = $14
    `, [
      v.id, v.plate, v.brand, v.owner, v.capacityM3 || v.capacity_m3, v.clientId || v.client_id, 
      v.soatExpiry || v.soat_expiry, v.technoExpiry || v.techno_expiry, v.statusId || v.status_id,
      v.soatPdfUrl || v.soat_pdf, v.technoPdfUrl || v.techno_pdf, v.modelYear || v.model_year, v.color, v.vehicleTypeId || v.vehicle_type || v.vehicleType
    ]);
    res.json({ success: true, message: 'Vehículo guardado' });
  } catch (err: any) {
    console.error('[M7-VEHICLES] Error saving:', err);
    res.status(500).json({ error: "Error al guardar el vehículo" });
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;

  try {
    // Auditoría: Obtener el registro antes de borrar
    const record = await pool.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['vehicles', id, record.rows[0], deletedBy || 'Unknown']
      );
    }

    // SOFT DELETE: Marcar como ELIMINADO en lugar de borrar físicamente
    await pool.query("UPDATE vehicles SET status_id = 'ELIMINADO', plate = plate || '_DEL_' || extract(epoch from now()) WHERE id = $1", [id]);
    
    // También podríamos querer cerrar asignaciones activas si las hay, pero por ahora solo el vehículo.
    
    res.json({ success: true, message: 'Vehículo eliminado y auditado' });
  } catch (err: any) {
    console.error('[M7-VEHICLES] Error deleting:', err);
    res.status(500).json({ error: "Error al eliminar vehículo" });
  }
};
