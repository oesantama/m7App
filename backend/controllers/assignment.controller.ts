
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getAssignments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT a.*, v.plate, d.name as driver_name 
      FROM assignments a
      JOIN vehicles v ON a.vehicle_id = v.id
      JOIN drivers d ON a.driver_id = d.id
      WHERE a.is_active = true
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener asignaciones" });
  }
};

export const saveAssignment = async (req: Request, res: Response) => {
  const { id, vehicleId, driverId, clientId } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Bloqueo FOR UPDATE para evitar doble asignación del mismo vehículo
    const vehicleCheck = await client.query('SELECT status_id FROM vehicles WHERE id = $1 FOR UPDATE', [vehicleId]);
    
    // 2. Verificar disponibilidad del conductor
    const driverCheck = await client.query('SELECT status_id FROM drivers WHERE id = $1 FOR UPDATE', [driverId]);

    // 3. Verificar si ya hay una asignación activa para este vehículo o conductor
    const activeCheck = await client.query(`
      SELECT id FROM assignments 
      WHERE (vehicle_id = $1 OR driver_id = $2) AND is_active = true
      FOR UPDATE
    `, [vehicleId, driverId]);

    if (activeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: "Conflicto de Asignación", 
        message: "El vehículo o el conductor ya tienen una asignación activa." 
      });
    }

    await client.query(`
      INSERT INTO assignments (id, vehicle_id, driver_id, client_id, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (id) DO UPDATE SET
      vehicle_id = $2, driver_id = $3, client_id = $4, is_active = true, updated_at = NOW()
    `, [id || `as-${Date.now()}`, vehicleId, driverId, clientId]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Asignación guardada con éxito' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Error al procesar la asignación", details: err.message });
  } finally {
    client.release();
  }
};

export const endAssignment = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE assignments SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true, message: 'Asignación finalizada' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al finalizar asignación" });
  }
};
