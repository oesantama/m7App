
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getRoutes = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT r.*, v.plate, d.name as driver_name,
      (SELECT json_agg(invoice_id) FROM route_invoices WHERE route_id = r.id) as invoice_ids
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener rutas" });
  }
};

export const saveRoute = async (req: Request, res: Response) => {
  const { id, vehicleId, driverId, clientId, invoiceIds, createdBy } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Insertar Cabecera de Ruta
    await client.query(`
      INSERT INTO routes (id, vehicle_id, driver_id, client_id, created_by, status)
      VALUES ($1, $2, $3, $4, $5, 'Assigned')
      ON CONFLICT (id) DO UPDATE SET
      vehicle_id = $2, driver_id = $3, updated_by = $5, updated_at = NOW()
    `, [id || `rt-${Date.now()}`, vehicleId, driverId, clientId, createdBy]);

    // 2. Limpiar facturas previas si es una actualización
    await client.query('DELETE FROM route_invoices WHERE route_id = $1', [id]);

    // 3. Vincular Facturas y actualizar estado de las mismas
    for (const invId of invoiceIds) {
      // route_invoices usa text, asi que invId (string) esta bien
      await client.query('INSERT INTO route_invoices (route_id, invoice_id) VALUES ($1, $2)', [id, invId]);
    }
    
    // 4. Actualización Masiva de Estado en Document Items (con Fallback)
    if (invoiceIds.length > 0) {
       await client.query(`
         UPDATE document_items 
         SET item_status = 'Asignado'
         WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = ANY($1)
       `, [invoiceIds]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Ruta confirmada y guardada con éxito' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-ROUTE-CTRL] Error:', err.message);
    res.status(500).json({ error: "Error al guardar la ruta", details: err.message });
  } finally {
    client.release();
  }
};
export const logRouteMovement = async (req: Request, res: Response) => {
  const { routeId, invoiceId, action, userId, previousPlate, newPlate, details } = req.body;
  try {
    await pool.query(`
      INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, previous_plate, new_plate, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [routeId, invoiceId, action, userId, previousPlate, newPlate, JSON.stringify(details)]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[M7-ROUTE-LOG-ERR]', err.message);
    res.status(500).json({ error: "Error al registrar logs de la ruta" });
  }
};
