
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getAssignments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT a.*, v.plate, d.name as driver_name 
      FROM assignments a
      JOIN vehicles v ON a.vehicle_id = v.id
      JOIN drivers d ON a.driver_id = d.id
      ORDER BY a.created_at DESC
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

    // 1. Cerrar cualquier asignación activa previa del mismo vehículo o conductor
    //    Esto conserva el historial (is_active=false) y permite reasignar
    await client.query(`
      UPDATE assignments
      SET is_active = false, updated_at = NOW()
      WHERE (vehicle_id = $1 OR driver_id = $2) AND is_active = true
    `, [vehicleId, driverId]);

    // 2. Crear la nueva asignación activa
    const insertRes = await client.query(`
      INSERT INTO assignments (id, vehicle_id, driver_id, client_id, is_active, created_at, updated_at)
      SELECT COALESCE(MAX(id), 0) + 1, $1, $2, $3, true, NOW(), NOW()
      FROM assignments
      RETURNING id
    `, [vehicleId, driverId, clientId]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Asignación guardada con éxito', id: insertRes.rows[0].id });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Error al procesar la asignación" });
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
