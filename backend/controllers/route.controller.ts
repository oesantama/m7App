
import { Request, Response } from 'express';
import pool from '../config/database.js';

interface LearningPatternData {
  city: string;
  vehicle_id: string;
}

export const getRoutes = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.id::text, r.vehicle_id::text, r.driver_id::text, r.client_id::text, r.created_by::text, r.status::text, r.created_at,
        v.plate, d.name as driver_name,
        COALESCE(
          (
            SELECT json_agg(invoice_id) 
            FROM route_invoices 
            WHERE route_id::text = r.id::text
          ),
          '[]'::json
        ) as invoice_ids
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id::text = v.id::text
      LEFT JOIN drivers d ON r.driver_id::text = d.id::text

      UNION ALL

      SELECT 
        da.id::text, 
        COALESCE(a.vehicle_id::text, 'S/V') as vehicle_id, 
        da.driver_id::text, 
        'CLI-01' as client_id, 
        da.created_by::text, 
        da.status::text, 
        da.created_at,
        v.plate, 
        d.name as driver_name,
        json_build_array(da.invoice_id) as invoice_ids
      FROM dispatch_assignments da
      LEFT JOIN assignments a ON da.driver_id::text = a.driver_id::text AND a.is_active = true
      LEFT JOIN vehicles v ON a.vehicle_id::text = v.id::text
      LEFT JOIN drivers d ON da.driver_id::text = d.id::text
      WHERE da.status IN ('PENDING_SIGNATURES', 'EN_RUTA', 'En repart', 'PENDING')
      
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-ROUTES-ERR]', err);
    res.status(500).json({ error: "Error al obtener rutas", details: err.message });
  }
};

export const getRoutingPatterns = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM routing_patterns WHERE strength > 0 ORDER BY strength DESC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-PATTERNS-ERR]', err.message);
    res.status(500).json({ error: "Error al obtener patrones de aprendizaje" });
  }
};

export const saveRoute = async (req: Request, res: Response) => {
  const { id, vehicleId, driverId, clientId, invoiceIds, createdBy } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // AUTO-ASSIGN DRIVER IF MISSING (Requerimiento Crítico)
    let finalDriverId = driverId;
    if (!finalDriverId || finalDriverId === 'S/A' || finalDriverId === '') {
      const linkRes = await client.query('SELECT driver_id FROM assignments WHERE vehicle_id = $1 AND is_active = true LIMIT 1', [vehicleId]);
      if (linkRes.rows.length > 0) {
        finalDriverId = linkRes.rows[0].driver_id;
      }
    }

    // 1. Insertar Cabecera de Ruta
    const routeRes = await client.query(`
      INSERT INTO routes (vehicle_id, driver_id, client_id, created_by, status)
      VALUES ($1, $2, $3, $4, 'EST-10')
      RETURNING id
    `, [vehicleId, finalDriverId, clientId, createdBy]);

    const finalRouteId = routeRes.rows[0].id;

    // 2. Vincular Facturas y actualizar estado de las mismas (Deduplicating inputs)
    const uniqueInvoiceIds = [...new Set(invoiceIds as string[])];

    for (const invId of uniqueInvoiceIds) {
      await client.query('INSERT INTO route_invoices (route_id, invoice_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [finalRouteId, invId]);
    }

    // 4. Actualización Masiva de Estado en Document Items (con Fallback)
    if (uniqueInvoiceIds.length > 0) {
      console.log('[DEBUG] Attempting to update status for IDs:', uniqueInvoiceIds);

      const updateResult = await client.query(`
         UPDATE document_items 
         SET item_status = 'EST-10' -- ASIGNADO
         WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = ANY($1)
         RETURNING id
       `, [uniqueInvoiceIds]);

      console.log(`[DEBUG] Updated ${updateResult.rowCount} document_items to EST-10`);

      if (updateResult.rowCount === 0) {
        console.warn('[WARN] No document_items were updated! Checking for whitespace mismatches...');
        // Intento secundario con TRIM si el primero falla
        await client.query(`
             UPDATE document_items 
             SET item_status = 'EST-10' -- ASIGNADO
             WHERE CONCAT(document_id, '_', TRIM(COALESCE(NULLIF(invoice, ''), order_number))) = ANY($1)
          `, [uniqueInvoiceIds]);
      }
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

    // APRENDIZAJE IA M7: Si se agrega una factura a una ruta (manual), aprendemos la afinidad Ciudad-Vehículo
    if (action === 'ADD' && details?.city && newPlate) {
      // Buscamos el ID del vehículo por la placa
      const vRes = await pool.query('SELECT id FROM vehicles WHERE plate = $1', [newPlate]);
      if (vRes.rows.length > 0) {
        const vId = vRes.rows[0].id;
        const city = String(details.city).toUpperCase().trim();

        await pool.query(`
                INSERT INTO routing_patterns (city, vehicle_id, strength, last_used)
                VALUES ($1, $2, 1, NOW())
                ON CONFLICT (city, vehicle_id) DO UPDATE SET
                strength = routing_patterns.strength + 1,
                last_used = NOW()
            `, [city, vId]);
        console.log(`[M7-LEARNING] Patrón registrado: ${city} -> ${newPlate} (Strength++)`);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[M7-ROUTE-LOG-ERR]', err.message);
    res.status(500).json({ error: "Error al registrar logs de la ruta" });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  const { vehicleId, driverId, latitude, longitude, accuracy, speed, heading } = req.body;
  try {
    await pool.query(`
            INSERT INTO vehicle_locations (vehicle_id, driver_id, latitude, longitude, accuracy, speed, heading)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [vehicleId, driverId, latitude, longitude, accuracy || null, speed || null, heading || null]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[M7-GPS-LOG-ERR]', err.message);
    res.status(500).json({ error: "Error al registrar ubicación GPS" });
  }
};

export const getLatestLocations = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM v_latest_vehicle_locations');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GPS-GET-ERR]', err.message);
    res.status(500).json({ error: "Error al obtener ubicaciones del centro de mando" });
  }
};
