
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
      LEFT JOIN assignments a ON da.driver_id::text = a.driver_id::text AND a.is_active::boolean = true
      LEFT JOIN vehicles v ON a.vehicle_id::text = v.id::text
      LEFT JOIN drivers d ON da.driver_id::text = d.id::text
      WHERE da.status IN ('PENDING_SIGNATURES', 'EN_RUTA', 'En repart', 'PENDING')
      
      ORDER BY created_at DESC
    `);
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
      INSERT INTO routes (vehicle_id, driver_id, client_id, created_by, status_id, total_volume_m3, vehicle_capacity_m3, utilization_pct)
      VALUES ($1, $2, $3, $4, 'EST-10', $5, $6, $7)
      RETURNING id
    `, [vehicleId, finalDriverId, clientId, createdBy,
        Number(totalVolume) || 0,
        Number(capacityM3) || 0,
        Number(utilization) || 0]);

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
        signal: AbortSignal.timeout(20000)
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
