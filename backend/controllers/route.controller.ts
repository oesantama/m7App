
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
        r.id::text, r.vehicle_id::text, r.driver_id::text, r.client_id::text, r.created_by::text, r.status_id::text, r.created_at,
        v.plate, d.name as driver_name, d.document_number as driver_document,
        COALESCE(
          (
            SELECT json_agg(invoice_id)
            FROM route_invoices
            WHERE route_id::text = r.id::text
          ),
          '[]'::json
        ) as invoice_ids,
        -- Contadores robustos via subquery
        (
          SELECT COUNT(DISTINCT ri.invoice_id)
          FROM route_invoices ri
          WHERE ri.route_id::text = r.id::text
        ) as total_invoices,
        (
          SELECT COUNT(DISTINCT ri.invoice_id)
          FROM route_invoices ri
          JOIN document_items di ON (
            CONCAT(di.document_id, '_', COALESCE(NULLIF(di.invoice, ''), di.order_number)) = ri.invoice_id 
            OR TRIM(COALESCE(NULLIF(di.invoice, ''), di.order_number)) = ri.invoice_id
          )
          WHERE ri.route_id::text = r.id::text
            AND di.item_status IN ('EST-11', 'EST-12', 'EST-13', 'EST-14', 'COMPLETED', 'ENTREGADO', 'FINALIZADO')
        ) as delivered_invoices
      FROM routes r
      LEFT JOIN vehicles v ON r.vehicle_id::text = v.id::text
      LEFT JOIN drivers d ON r.driver_id::text = d.id::text
      WHERE r.created_at >= CURRENT_DATE - INTERVAL '7 days'
        -- Solo excluir rutas canceladas/reasignadas; la visibilidad se basa en el estado de los ítems
        AND r.status_id NOT IN ('EST-16', 'COMPLETADO', 'FINALIZADO')
        -- Mostrar la ruta si tiene al menos una factura en estado activo (ASIGNADO, EN RUTA, REPICE)
        -- o si no hay coincidencia en document_items (ruta nueva aún sin ítems actualizados)
        AND EXISTS (
          SELECT 1 FROM route_invoices ri
          LEFT JOIN document_items di ON (
            TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
            OR CONCAT(di.document_id::text, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
          )
          WHERE ri.route_id::text = r.id::text
            AND (
              di.item_status IN ('EST-10','EST-11','EST-15','REPICE','ASIGNADO','EN_RUTA')
              OR di.item_status IS NULL
            )
        )

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
        d.document_number as driver_document,
        json_build_array(da.invoice_id) as invoice_ids,
        1 as total_invoices,
        CASE WHEN da.status IN ('COMPLETED', 'PENDING_SIGNATURES', 'EN_RUTA', 'EST-11', 'EST-12', 'ENTREGADO') THEN 1 ELSE 0 END as delivered_invoices
      FROM dispatch_assignments da
      LEFT JOIN assignments a ON da.driver_id::text = a.driver_id::text AND a.is_active::boolean = true
      LEFT JOIN vehicles v ON a.vehicle_id::text = v.id::text
      LEFT JOIN drivers d ON da.driver_id::text = d.id::text
      WHERE da.status IN ('PENDING_SIGNATURES', 'EN_RUTA', 'En repart', 'PENDING')
        AND da.created_at >= CURRENT_DATE - INTERVAL '7 days'

      ORDER BY created_at DESC
    `);
    
    if (result.rows.length > 0) {
      console.log(`[M7-SUCCESS] getRoutes: Enviando ${result.rows.length} rutas activas (últimos 7 días).`);
    } else {
      console.warn('[M7-WARN] getRoutes: No se encontraron rutas activas en los últimos 7 días.');
    }

    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-ROUTES-ERR]', err);
    res.status(500).json({ error: "Error al obtener rutas" });
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
  const { id, vehicleId, driverId, clientId, invoiceIds, createdBy, totalVolume, utilization, capacityM3 } = req.body;
  const client = await pool.connect();

  try {
    // Asegurar columnas de eficiencia FUERA de la transacción (DDL no puede estar en BEGIN/COMMIT)
    await client.query('ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_volume_m3 NUMERIC(10,4) DEFAULT 0');
    await client.query('ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_capacity_m3 NUMERIC(10,2) DEFAULT 0');
    await client.query('ALTER TABLE routes ADD COLUMN IF NOT EXISTS utilization_pct INTEGER DEFAULT 0');

    await client.query('BEGIN');

    // AUTO-ASSIGN DRIVER IF MISSING (Requerimiento Crítico)
    let finalDriverId = driverId;
    if (!finalDriverId || finalDriverId === 'S/A' || finalDriverId === '') {
      const linkRes = await client.query('SELECT driver_id FROM assignments WHERE vehicle_id = $1 AND is_active = true LIMIT 1', [vehicleId]);
      if (linkRes.rows.length > 0) {
        finalDriverId = linkRes.rows[0].driver_id;
      }
    }

    // 1. Insertar Cabecera de Ruta con datos de eficiencia
    const routeRes = await client.query(`
      INSERT INTO routes (vehicle_id, driver_id, client_id, created_by, status_id, total_volume_m3, vehicle_capacity_m3, utilization_pct, created_at)
      VALUES ($1, $2, $3, $4, 'EST-10', $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING id
    `, [vehicleId, finalDriverId, clientId, createdBy,
        Number(totalVolume) || 0,
        Number(capacityM3) || 0,
        Number(utilization) || 0]);

    const finalRouteId = routeRes.rows[0].id;

    // 2. Vincular Facturas y actualizar estado de las mismas (Deduplicating inputs)
    const uniqueInvoiceIds = [...new Set(invoiceIds as string[])];

    for (const invId of uniqueInvoiceIds) {
      await client.query('INSERT INTO route_invoices (route_id, invoice_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING', [finalRouteId, invId]);
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
    console.log(`[M7-ROUTE-SUCCESS] Ruta #${finalRouteId} guardada con éxito. Invoices: ${uniqueInvoiceIds.length}`);
    res.json({ 
      success: true, 
      message: 'Ruta confirmada y guardada con éxito',
      routeId: finalRouteId 
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-ROUTE-CTRL] Error:', err.message);
    res.status(500).json({ error: "Error al guardar la ruta" });
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

    // APRENDIZAJE IA M7 IQ: Si se agrega una factura a una ruta (manual), aprendemos la afinidad Ciudad-Vehículo-Barrio
    if (action === 'ADD' && details?.city && newPlate) {
      // Buscamos el ID del vehículo por la placa
      const vRes = await pool.query('SELECT id FROM vehicles WHERE plate = $1', [newPlate]);
      if (vRes.rows.length > 0) {
        const vId = vRes.rows[0].id;
        const city = String(details.city).toUpperCase().trim();
        const neighborhood = String(details.neighborhood || '').toUpperCase().trim();

        await pool.query(`
                INSERT INTO routing_patterns (city, vehicle_id, neighborhood, strength, last_used)
                VALUES ($1, $2, $3, 1, NOW())
                ON CONFLICT (city, vehicle_id, neighborhood) DO UPDATE SET
                strength = routing_patterns.strength + 1,
                last_used = NOW()
            `, [city, vId, neighborhood]);
        console.log(`[M7-LEARNING-IQ] Patrón registrado: ${city} | ${neighborhood} -> ${newPlate} (Strength++)`);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[M7-ROUTE-LOG-ERR]', err.message);
    res.status(500).json({ error: "Error al registrar logs de la ruta" });
  }
};

export const learnFromCompletedRoute = async (req: Request, res: Response) => {
  const { vehicleId, stops } = req.body;

  if (!vehicleId || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: "vehicleId y stops[] son requeridos" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const stop of stops) {
      const city = String(stop.city || '').toUpperCase().trim();
      const neighborhood = String(stop.neighborhood || '').toUpperCase().trim();
      if (!city) continue;

      await client.query(`
        INSERT INTO routing_patterns (city, vehicle_id, neighborhood, strength, last_used)
        VALUES ($1, $2, $3, 2, NOW())
        ON CONFLICT (city, vehicle_id, neighborhood) DO UPDATE SET
          strength = routing_patterns.strength + 2,
          last_used = NOW()
      `, [city, vehicleId, neighborhood]);
    }

    await client.query('COMMIT');
    console.log(`[M7-IQ-ROUTE] Aprendizaje de ruta confirmada: ${stops.length} paradas para vehículo ${vehicleId}`);
    res.json({ success: true, patternsUpdated: stops.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-IQ-ROUTE-ERR]', err.message);
    res.status(500).json({ error: "Error al registrar aprendizaje de ruta" });
  } finally {
    client.release();
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

// Geocodificación con Nominatim + caché en BD
let lastNominatimCall = 0;
export const geocodeAddress = async (req: Request, res: Response) => {
  const { address, city } = req.body;
  if (!address || !city) return res.status(400).json({ error: 'address and city required' });

  const addressKey = `${address}|${city}`.toLowerCase().trim();
  try {
    // Verificar caché
    const cached = await pool.query('SELECT lat, lng FROM geocoding_cache WHERE address_key = $1', [addressKey]);
    if (cached.rowCount && cached.rowCount > 0) {
      return res.json({ lat: cached.rows[0].lat, lng: cached.rows[0].lng, cached: true });
    }

    // Rate limit Nominatim: máx 1 req/seg
    const now = Date.now();
    const wait = 1100 - (now - lastNominatimCall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNominatimCall = Date.now();

    const query = encodeURIComponent(`${address}, ${city}, Colombia`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=co`, {
      headers: { 'User-Agent': 'OrbitM7LogisticsApp/1.0' }
    });
    const data = await response.json() as any[];

    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      await pool.query(
        'INSERT INTO geocoding_cache (address_key, address, city, lat, lng) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (address_key) DO NOTHING',
        [addressKey, address, city, lat, lng]
      );
      return res.json({ lat, lng, cached: false });
    }
    res.json({ lat: 6.2518, lng: -75.5636, cached: false, fallback: true });
  } catch (err: any) {
    res.json({ lat: 6.2518, lng: -75.5636, cached: false, fallback: true });
  }
};

// Ruteo real por calles via OSRM (OpenStreetMap) — proxy para evitar CORS
// Servidores OSRM públicos en orden de prioridad
const OSRM_SERVERS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
  'https://osrm.openstreetmap.de/routed-car',
];

export const getRoadRoute = async (req: Request, res: Response) => {
  const { waypoints } = req.body as { waypoints: { lat: number; lng: number }[] };
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return res.status(400).json({ error: 'Se requieren al menos 2 waypoints' });
  }

  // OSRM espera lng,lat (no lat,lng)
  const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');

  for (const server of OSRM_SERVERS) {
    const url = `${server}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OrbitM7-Logistics/1.0 (logistics@orbitm7.io)' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`OSRM status ${response.status}`);
      const data = await response.json() as any;

      if (data.code === 'Ok' && data.routes?.[0]?.geometry) {
        return res.json({
          coordinates: data.routes[0].geometry.coordinates, // [[lng,lat], ...]
          distance_m:  data.routes[0].distance,
          duration_s:  data.routes[0].duration
        });
      }
      throw new Error('OSRM no retornó ruta válida');
    } catch (err: any) {
      console.warn(`[M7-OSRM] Falló ${server}: ${err.message} — intentando siguiente servidor...`);
    }
  }

  console.error('[M7-OSRM] Todos los servidores fallaron');
  return res.status(500).json({ error: 'Error al calcular ruta por calles' });
};

// ─── GET /routes/:routeId/invoices ───────────────────────────────────────────
export const getRouteInvoices = async (req: Request, res: Response) => {
    const { routeId } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                ri.invoice_id,
                COALESCE(NULLIF(di.invoice,''), di.order_number) AS invoice_number,
                di.customer_name,
                di.city,
                MAX(p.vmetodo)           AS invoice_value,
                MAX(di.item_status)      AS item_status
            FROM route_invoices ri
            LEFT JOIN document_items di ON (
                TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = TRIM(ri.invoice_id)
                OR CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) = ri.invoice_id
            )
            LEFT JOIN document_l_payments p ON TRIM(UPPER(p.invoice)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
            WHERE ri.route_id::text = $1::text
            GROUP BY ri.invoice_id, di.invoice, di.order_number, di.customer_name, di.city
            ORDER BY invoice_number
        `, [routeId]);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /routes/unassign-invoice ───────────────────────────────────────────
export const unassignRouteInvoice = async (req: Request, res: Response) => {
    const { routeId, invoiceId, observations, userId } = req.body;
    if (!routeId || !invoiceId) {
        return res.status(400).json({ success: false, error: 'routeId e invoiceId son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar que la factura pertenece a esta ruta
        const check = await client.query(
            `SELECT 1 FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
            [routeId, invoiceId]
        );
        if (!check.rowCount) {
            throw new Error('La factura no pertenece a esta ruta');
        }

        // 2. Eliminar de route_invoices
        await client.query(
            `DELETE FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
            [routeId, invoiceId]
        );

        // 3. Resetear item_status a EST-03 (Para Despacho) → disponible para reasignar
        await client.query(
            `UPDATE document_items SET item_status = 'EST-03'
             WHERE CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
                OR TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1`,
            [invoiceId]
        );

        // 4. Registrar en log (con invoice_id y placa anterior)
        const plateRes = await client.query(
            `SELECT v.plate FROM routes r LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text WHERE r.id::text = $1::text LIMIT 1`,
            [routeId]
        );
        const prevPlate = plateRes.rows[0]?.plate || null;
        await client.query(
            `INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, previous_plate, details)
             VALUES ($1, $2, 'UNASSIGN_INVOICE', $3, $4, $5)`,
            [routeId, invoiceId, userId || null, prevPlate, JSON.stringify({ observations, timestamp: new Date().toISOString() })]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-UNASSIGN-INVOICE]', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const repiceRouteInvoice = async (req: Request, res: Response) => {
    const { routeId, invoiceId, observations, userId } = req.body;
    if (!routeId || !invoiceId) {
        return res.status(400).json({ success: false, error: 'routeId e invoiceId son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar que la factura pertenece a esta ruta
        const check = await client.query(
            `SELECT 1 FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
            [routeId, invoiceId]
        );
        if (!check.rowCount) {
            throw new Error('La factura no pertenece a esta ruta');
        }

        // 2. Actualizar item_status a EST-15 (REPICE) y fecha asignación al momento actual
        await client.query(
            `UPDATE document_items SET item_status = 'EST-15'
             WHERE CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
                OR TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1`,
            [invoiceId]
        );

        await client.query(
            `UPDATE route_invoices SET assigned_at = NOW()
             WHERE route_id::text = $1::text AND invoice_id = $2`,
            [routeId, invoiceId]
        );

        // 3. Registrar en log con acción REPICE_INVOICE
        const plateRes = await client.query(
            `SELECT v.plate, r.driver_id, d.name AS driver_name
             FROM routes r
             LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
             LEFT JOIN drivers d ON d.id::text = r.driver_id::text
             WHERE r.id::text = $1::text LIMIT 1`,
            [routeId]
        );
        const prevPlate  = plateRes.rows[0]?.plate      || null;
        const driverName = plateRes.rows[0]?.driver_name || null;
        const obs        = `repice: ${observations || ''}`;
        await client.query(
            `INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, previous_plate, details)
             VALUES ($1, $2, 'REPICE_INVOICE', $3, $4, $5)`,
            [routeId, invoiceId, userId || null, prevPlate,
             JSON.stringify({ observations: obs, driver_name: driverName, timestamp: new Date().toISOString() })]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-REPICE-INVOICE]', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const reassignRouteVehicle = async (req: Request, res: Response) => {
  const { routeId, newVehicleId, observations, userId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtener datos de la ruta actual
    const currentRoute = await client.query('SELECT * FROM routes WHERE id = $1', [routeId]);
    if (currentRoute.rowCount === 0) {
      throw new Error('Ruta no encontrada');
    }
    const oldRoute = currentRoute.rows[0];

    // 2. Obtener conductor del nuevo vehículo (Prioridad: Activo, Fallback: Último conocido)
    const assignment = await client.query(`
      SELECT driver_id FROM assignments 
      WHERE vehicle_id = $1 
      ORDER BY is_active DESC, created_at DESC LIMIT 1
    `, [newVehicleId]);
    
    // Si no se encuentra conductor para el NUEVO vehículo, no podemos heredar el viejo (porque es de otro camión)
    const newDriverId = assignment.rows[0]?.driver_id;
    if (!newDriverId) {
      throw new Error(`No se pudo encontrar un conductor vinculado a la placa ${newVehicleId}. Verifique el vínculo en Operativa.`);
    }

    // 3. Cancelar ruta vieja (Estado EST-16)
    await client.query('UPDATE routes SET status_id = \'EST-16\' WHERE id = $1', [routeId]);

    // 4. Crear nueva ruta
    const newRouteRes = await client.query(`
      INSERT INTO routes (vehicle_id, driver_id, client_id, created_by, status_id, created_at)
      VALUES ($1, $2, $3, $4, 'EST-10', CURRENT_TIMESTAMP)
      RETURNING id
    `, [newVehicleId, newDriverId, oldRoute.client_id, userId]);
    
    const newRouteId = newRouteRes.rows[0].id;

    // 5. Clonar facturas asociadas
    const invoices = await client.query('SELECT invoice_id FROM route_invoices WHERE route_id = $1', [routeId]);
    const invoiceIds = invoices.rows.map(r => r.invoice_id);

    if (invoiceIds.length > 0) {
      for (const invId of invoiceIds) {
        await client.query(
          'INSERT INTO route_invoices (route_id, invoice_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [newRouteId, invId]
        );
      }

      // 6. Actualizar item_status en document_items a 'EST-03' (Para Despacho)
      await client.query(`
        UPDATE document_items 
        SET item_status = 'EST-03'
        WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = ANY($1)
      `, [invoiceIds]);
    }

    // 7. Loguear movimiento
    await client.query(`
      INSERT INTO route_modifications_log (route_id, action, user_id, previous_plate, new_plate, details)
      VALUES ($1, 'REASSIGN_PLATE', $2, $3, $4, $5)
    `, [routeId, userId, oldRoute.vehicle_id || null, newVehicleId || null, JSON.stringify({
      old_route_id: routeId,
      new_route_id: newRouteId,
      observations
    })]);

    await client.query('COMMIT');
    res.json({ success: true, newRouteId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-REASSIGN-ERR]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
