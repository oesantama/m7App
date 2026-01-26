
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getVehicles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM vehicles ORDER BY plate ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-VEHICLES] Offline Mode activo');
    res.json([]); 
  }
};

export const saveVehicle = async (req: Request, res: Response) => {
  const v = req.body;
  try {
    await pool.query(`
      INSERT INTO vehicles (id, plate, brand, owner, capacity_m3, client_id, soat_expiry, techno_expiry, status_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
      plate = $2, brand = $3, owner = $4, capacity_m3 = $5, client_id = $6, soat_expiry = $7, techno_expiry = $8, status_id = $9
    `, [v.id, v.plate, v.brand, v.owner, v.capacityM3, v.clientId, v.soatExpiry, v.technoExpiry, v.statusId]);
    res.json({ success: true, message: 'Vehículo guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el vehículo" });
  }
};
