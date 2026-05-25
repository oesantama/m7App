
import { Request, Response } from 'express';
import pool from '../config/database.js';

interface LearningPatternData {
  city: string;
  vehicle_id: string;
}

export const getRoutes = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      WITH ri_stats AS (
        SELECT
          ri.route_id,
          json_agg(ri.invoice_id)        AS invoice_ids,
          COUNT(DISTINCT ri.invoice_id)  AS total_invoices
        FROM route_invoices ri
        GROUP BY ri.route_id
      ),
      ri_delivered AS (
        SELECT ri.route_id, COUNT(DISTINCT ri.invoice_id) AS delivered_invoices
        FROM route_invoices ri
        JOIN document_items di
          ON di.invoice = ri.invoice_id
          OR di.invoice = SPLIT_PART(ri.invoice_id, '_', 2)
        WHERE di.item_status IN ('EST-11','EST-12','EST-13','EST-14','COMPLETED','ENTREGADO','FINALIZADO')
        GROUP BY ri.route_id
      ),
      active_routes AS (
        SELECT DISTINCT route_id
        FROM route_invoices ri
        LEFT JOIN document_items di
          ON di.invoice = ri.invoice_id
          OR di.invoice = SPLIT_PART(ri.invoice_id, '_', 2)
        WHERE di.item_status NOT IN ('EST-12','EST-13','EST-14','COMPLETADO','FINALIZADO','ENTREGADO')
           OR di.item_status IS NULL
      )
      SELECT
        r.id::text, r.vehicle_id::text, r.driver_id::text, r.client_id::text,
        r.created_by::text, r.status_id::text, r.created_at,
        v.plate, d.name AS driver_name, d.document_number AS driver_document,
        COALESCE(s.invoice_ids, '[]'::json)       AS invoice_ids,
        COALESCE(s.total_invoices, 0)             AS total_invoices,
        COALESCE(del.delivered_invoices, 0)       AS delivered_invoices
      FROM routes r
      LEFT JOIN vehicles    v   ON v.id::text        = r.vehicle_id::text
      LEFT JOIN drivers     d   ON d.id::text        = r.driver_id::text
      LEFT JOIN ri_stats    s   ON s.route_id::text  = r.id::text
      LEFT JOIN ri_delivered del ON del.route_id::text = r.id::text
      INNER JOIN active_routes ar ON ar.route_id::text = r.id::text
      WHERE r.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND r.status_id NOT IN ('EST-16', 'COMPLETADO', 'FINALIZADO')

      UNION ALL

      SELECT
        da.id::text,
        COALESCE(a.vehicle_id::text, 'S/V') AS vehicle_id,
        da.driver_id::text,
        'CLI-01'                             AS client_id,
        da.created_by::text,
        da.status::text,
        da.created_at,
        v.plate,
        d.name                               AS driver_name,
        d.document_number                    AS driver_document,
        json_build_array(da.invoice_id)      AS invoice_ids,
        1                                    AS total_invoices,
        CASE WHEN da.status IN ('COMPLETED','PENDING_SIGNATURES','EN_RUTA','EST-11','EST-12','ENTREGADO')
             THEN 1 ELSE 0 END              AS delivered_invoices
      FROM dispatch_assignments da
      LEFT JOIN assignments a ON a.driver_id::text = da.driver_id::text AND a.is_active = true
      LEFT JOIN vehicles    v ON v.id::text        = a.vehicle_id::text
      LEFT JOIN drivers     d ON d.id::text        = da.driver_id::text
      WHERE da.status IN ('PENDING_SIGNATURES','EN_RUTA','En repart','PENDING')
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

export const getDeliveryPatterns = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT dp.address_key, dp.vehicle_id, v.plate, dp.strength, dp.last_used
       FROM delivery_patterns dp
       LEFT JOIN vehicles v ON v.id = dp.vehicle_id
       WHERE dp.strength > 0
       ORDER BY dp.strength DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-GET-DELIVERY-PATTERNS-ERR]', err.message);
    res.status(500).json({ error: "Error al obtener patrones de entrega" });
  }
};

export const saveRoute = async (req: Request, res: Response) => {
  const { id, vehicleId, driverId, clientId, invoiceIds, repiceInvoiceIds, createdBy, totalVolume, utilization, capacityM3, shift } = req.body;
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

    // 1. Insertar Cabecera de Ruta con datos de eficiencia
    const routeRes = await client.query(`
      INSERT INTO routes (vehicle_id, driver_id, client_id, created_by, status_id, total_volume_m3, vehicle_capacity_m3, utilization_pct, shift, created_at)
      VALUES ($1, $2, $3, $4, 'EST-10', $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING id
    `, [vehicleId, finalDriverId, clientId, createdBy,
        Number(totalVolume) || 0,
        Number(capacityM3) || 0,
        Number(utilization) || 0,
        Number(shift) || 1]);

    const finalRouteId = routeRes.rows[0].id;

    // 2. Vincular Facturas y actualizar estado de las mismas (Deduplicating inputs)
    const uniqueInvoiceIds = [...new Set(invoiceIds as string[])];
    const uniqueRepiceIds = [...new Set((repiceInvoiceIds || []) as string[])];

    // Para facturas REPICE: desasignar de rutas anteriores antes de vincular a la nueva
    if (uniqueRepiceIds.length > 0) {
      await client.query(
        `DELETE FROM route_invoices WHERE invoice_id = ANY($1)`,
        [uniqueRepiceIds]
      );
    }

    for (const invId of uniqueInvoiceIds) {
      await client.query('INSERT INTO route_invoices (route_id, invoice_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING', [finalRouteId, invId]);
    }

    // 4. Actualización Masiva de Estado en Document Items — excluir REPICE (se mantienen en EST-15)
    const nonRepiceIds = uniqueInvoiceIds.filter(id => !uniqueRepiceIds.includes(id));
    if (nonRepiceIds.length > 0) {
      console.log('[DEBUG] Attempting to update status for IDs:', nonRepiceIds);

      const updateResult = await client.query(`
         UPDATE document_items
         SET item_status = 'EST-10'
         WHERE TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = ANY($1)
            OR CONCAT(document_id, '_', TRIM(COALESCE(NULLIF(invoice, ''), order_number))) = ANY($1)
         RETURNING id
       `, [nonRepiceIds]);

      console.log(`[DEBUG] Updated ${updateResult.rowCount} document_items to EST-10`);
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
  // stops = entregas exitosas (+2 strength)
  // failedStops = no entregadas, penalty -1
  // returnedStops = devueltas por cliente, penalty -0.5
  const { vehicleId, stops, failedStops = [], returnedStops = [] } = req.body;

  if (!vehicleId || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: "vehicleId y stops[] son requeridos" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Aprender de entregas exitosas (+2) ─────────────────────────────────
    for (const stop of stops) {
      const city = String(stop.city || '').toUpperCase().trim();
      const neighborhood = String(stop.neighborhood || '').toUpperCase().trim();
      if (!city) continue;

      await client.query(`
        INSERT INTO routing_patterns (city, vehicle_id, neighborhood, strength, last_used)
        VALUES ($1, $2, $3, 2, NOW())
        ON CONFLICT (city, vehicle_id, neighborhood) DO UPDATE SET
          strength = COALESCE(routing_patterns.strength, 0) + 2,
          last_used = NOW()
      `, [city, vehicleId, neighborhood]);

      const address = String(stop.address || '').trim();
      if (address && address !== 'S/D') {
        const addrKey = `${address}|${city}`.toLowerCase();
        const clientId = String(stop.clientId || stop.client_id || '').trim() || null;
        await client.query(`
          INSERT INTO delivery_patterns (address_key, vehicle_id, client_id, strength, last_used)
          VALUES ($1, $2, $3, 2, NOW())
          ON CONFLICT (address_key, vehicle_id) DO UPDATE SET
            strength = COALESCE(delivery_patterns.strength, 0) + 2,
            last_used = NOW()
        `, [addrKey, vehicleId, clientId]);
      }
    }

    // ── Penalizar fallos del conductor (-1) ────────────────────────────────
    for (const stop of (failedStops as any[])) {
      const city = String(stop.city || '').toUpperCase().trim();
      const neighborhood = String(stop.neighborhood || '').toUpperCase().trim();
      if (!city) continue;
      await client.query(`
        UPDATE routing_patterns SET strength = GREATEST(0, strength - 1), last_used = NOW()
        WHERE city = $1 AND vehicle_id = $2 AND neighborhood = $3
      `, [city, vehicleId, neighborhood]);
      const address = String(stop.address || '').trim();
      if (address && address !== 'S/D') {
        const addrKey = `${address}|${city}`.toLowerCase();
        await client.query(`
          UPDATE delivery_patterns SET strength = GREATEST(0, strength - 1), last_used = NOW()
          WHERE address_key = $1 AND vehicle_id = $2
        `, [addrKey, vehicleId]);
      }
    }

    // ── Penalizar devoluciones del cliente (-0.5) — menor que fallo conductor
    for (const stop of (returnedStops as any[])) {
      const city = String(stop.city || '').toUpperCase().trim();
      const neighborhood = String(stop.neighborhood || '').toUpperCase().trim();
      if (!city) continue;
      await client.query(`
        UPDATE routing_patterns SET strength = GREATEST(0, strength - 0.5), last_used = NOW()
        WHERE city = $1 AND vehicle_id = $2 AND neighborhood = $3
      `, [city, vehicleId, neighborhood]);
    }

    await client.query('COMMIT');
    console.log(`[M7-IQ-ROUTE] Aprendizaje: +${stops.length} éxitos, -${(failedStops as any[]).length} fallos, -${(returnedStops as any[]).length} devueltas | vehículo ${vehicleId}`);
    res.json({ success: true, patternsUpdated: stops.length, penalized: (failedStops as any[]).length + (returnedStops as any[]).length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-IQ-ROUTE-ERR] DETALLE:', err);
    res.status(500).json({ error: "Error al registrar aprendizaje de ruta", details: err.message });
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

// ─── POST /routes/road-matrix ─────────────────────────────────────────────────
// Retorna la matriz NxN de distancias reales (km) y tiempos (min) entre puntos.
// Consulta la caché primero; llama OSRM solo para pares no cacheados.
// Fallback silencioso: si OSRM falla retorna matrix:null para que el frontend
// use Haversine en su lugar.
export const getRoadMatrix = async (req: Request, res: Response) => {
  const { points } = req.body as { points: { lat: number; lng: number }[] };
  if (!Array.isArray(points) || points.length < 2) {
    return res.json({ matrix: null });
  }
  if (points.length > 30) {
    // Limit de seguridad: OSRM público rechaza >100 coords, nosotros limitamos a 30
    return res.json({ matrix: null });
  }

  const toKey = (p: { lat: number; lng: number }) =>
    `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;

  const n = points.length;
  const keys = points.map(toKey);

  // ── 1. Consultar caché ──────────────────────────────────────────────────────
  const distMatrix: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  const durMatrix:  (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  for (let i = 0; i < n; i++) distMatrix[i][i] = durMatrix[i][i] = 0;

  const missingPairs: [number, number][] = [];

  try {
    // Batch cache lookup — una query para todos los pares
    const fromKeys = keys.flatMap((fk, i) => keys.map((_tk, j) => i !== j ? fk : null).filter(Boolean) as string[]);
    const toKeys   = keys.flatMap((_fk, i) => keys.map((tk, j) => i !== j ? tk : null).filter(Boolean) as string[]);

    if (fromKeys.length > 0) {
      const cached = await pool.query(
        `SELECT from_key, to_key, dist_km, dur_min FROM road_distance_cache
         WHERE (from_key, to_key) IN (${fromKeys.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',')})`,
        fromKeys.flatMap((fk, idx) => [fk, toKeys[idx]])
      );
      type CacheRow = { from_key: string; to_key: string; dist_km: string; dur_min: string };
      const cacheMap = new Map<string, CacheRow>(
        (cached.rows as CacheRow[]).map(r => [`${r.from_key}|${r.to_key}`, r])
      );
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const entry = cacheMap.get(`${keys[i]}|${keys[j]}`);
          if (entry) {
            distMatrix[i][j] = Number(entry.dist_km);
            durMatrix[i][j]  = Number(entry.dur_min);
          } else {
            missingPairs.push([i, j]);
          }
        }
      }
    }
  } catch {
    // Si la caché falla, simplemente llamamos OSRM para todo
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) missingPairs.push([i, j]);
  }

  // ── 2. Resolver pares no cacheados: Google Maps (con tráfico) → OSRM fallback ─
  if (missingPairs.length > 0) {
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    let matrixOk = false;

    // ── 2a. Google Maps Distance Matrix (tráfico real) ────────────────────────
    if (gmKey) {
      try {
        // Batches de hasta 10 orígenes × 10 destinos = 100 elementos/request
        const CHUNK = 10;
        const filled = new Map<string, { dkm: number; dmin: number }>();

        const uniqueOriginIdx  = [...new Set(missingPairs.map(([i]) => i))];
        const uniqueDestIdx    = [...new Set(missingPairs.map(([, j]) => j))];

        for (let oi = 0; oi < uniqueOriginIdx.length; oi += CHUNK) {
          const oChunk = uniqueOriginIdx.slice(oi, oi + CHUNK);
          for (let di = 0; di < uniqueDestIdx.length; di += CHUNK) {
            const dChunk = uniqueDestIdx.slice(di, di + CHUNK);

            const origins      = oChunk.map(i => `${points[i].lat},${points[i].lng}`).join('|');
            const destinations = dChunk.map(j => `${points[j].lat},${points[j].lng}`).join('|');
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&departure_time=now&key=${gmKey}`;

            const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!resp.ok) throw new Error(`GM status ${resp.status}`);
            const gm = await resp.json() as any;
            if (gm.status !== 'OK') throw new Error(`GM status: ${gm.status}`);

            gm.rows.forEach((row: any, ri: number) => {
              row.elements.forEach((el: any, ci: number) => {
                if (el.status !== 'OK') return;
                const i = oChunk[ri];
                const j = dChunk[ci];
                const dkm  = el.distance.value / 1000;
                // Prefer duration_in_traffic (real traffic), fall back to duration
                const dmin = (el.duration_in_traffic?.value ?? el.duration.value) / 60;
                filled.set(`${i}:${j}`, { dkm, dmin });
              });
            });
          }
        }

        const insValues: any[] = [];
        const filledPairs: [number, number][] = [];
        for (const [i, j] of missingPairs) {
          const v = filled.get(`${i}:${j}`);
          if (!v) continue;
          distMatrix[i][j] = v.dkm;
          durMatrix[i][j]  = v.dmin;
          insValues.push(keys[i], keys[j], v.dkm, v.dmin);
          filledPairs.push([i, j]);
        }

        if (insValues.length > 0) {
          const ph = filledPairs.map((_, idx) => `($${idx * 4 + 1},$${idx * 4 + 2},$${idx * 4 + 3},$${idx * 4 + 4})`).join(',');
          pool.query(
            `INSERT INTO road_distance_cache (from_key, to_key, dist_km, dur_min) VALUES ${ph}
             ON CONFLICT (from_key, to_key) DO UPDATE SET dist_km=EXCLUDED.dist_km, dur_min=EXCLUDED.dur_min, cached_at=NOW()`,
            insValues
          ).catch(() => {});
        }

        matrixOk = true;
        console.info(`[M7-TRAFFIC] Google Maps matrix (${filledPairs.length} pares, tráfico real)`);
      } catch (err: any) {
        console.warn(`[M7-TRAFFIC] Google Maps falló: ${err.message} — usando OSRM`);
      }
    }

    // ── 2b. OSRM fallback ────────────────────────────────────────────────────
    if (!matrixOk) {
      const coords = points.map(p => `${p.lng},${p.lat}`).join(';');

      for (const server of OSRM_SERVERS) {
        try {
          const url = `${server}/table/v1/driving/${coords}?annotations=distance,duration`;
          const resp = await fetch(url, {
            headers: { 'User-Agent': 'OrbitM7-Logistics/1.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) throw new Error(`status ${resp.status}`);
          const data = await resp.json() as any;
          if (data.code !== 'Ok') throw new Error('OSRM code != Ok');

          const distM: number[][] = data.distances;
          const durS:  number[][] = data.durations;

          const insValues: any[] = [];
          for (const [i, j] of missingPairs) {
            const dkm  = distM[i][j] / 1000;
            const dmin = durS[i][j]  / 60;
            distMatrix[i][j] = dkm;
            durMatrix[i][j]  = dmin;
            insValues.push(keys[i], keys[j], dkm, dmin);
          }

          if (insValues.length > 0) {
            const ph = missingPairs.map((_, idx) => `($${idx * 4 + 1},$${idx * 4 + 2},$${idx * 4 + 3},$${idx * 4 + 4})`).join(',');
            pool.query(
              `INSERT INTO road_distance_cache (from_key, to_key, dist_km, dur_min) VALUES ${ph}
               ON CONFLICT (from_key, to_key) DO UPDATE SET dist_km=EXCLUDED.dist_km, dur_min=EXCLUDED.dur_min, cached_at=NOW()`,
              insValues
            ).catch(() => {});
          }

          matrixOk = true;
          break;
        } catch (err: any) {
          console.warn(`[M7-ROAD-MATRIX] OSRM ${server} falló: ${err.message}`);
        }
      }
    }

    if (!matrixOk) {
      // Todos los proveedores fallaron — frontend usará Haversine como fallback
      return res.json({ matrix: null, fallback: true });
    }
  }

  res.json({ distMatrix, durMatrix });
};

// ─── GET /routes/:routeId/invoices ───────────────────────────────────────────
export const getRouteInvoices = async (req: Request, res: Response) => {
    const { routeId } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                ri.invoice_id,
                MAX(COALESCE(NULLIF(di.invoice,''), di.order_number)) AS invoice_number,
                MAX(di.customer_name)    AS customer_name,
                MAX(di.city)             AS city,
                MAX(p.vmetodo)           AS invoice_value,
                MAX(di.item_status)      AS item_status
            FROM route_invoices ri
            LEFT JOIN document_items di ON (
                TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = TRIM(ri.invoice_id)
                OR CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) = ri.invoice_id
            )
            LEFT JOIN document_l_payments p ON TRIM(UPPER(p.invoice)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
            WHERE ri.route_id::text = $1::text
            GROUP BY ri.invoice_id
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
    const { routeId, invoiceId, observations, userId, newVehicleId } = req.body;
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

        // 2. Actualizar item_status a EST-15 (REPICE)
        await client.query(
            `UPDATE document_items SET item_status = 'EST-15'
             WHERE CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
                OR TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1`,
            [invoiceId]
        );

        // 3. Obtener datos de la ruta/placa/conductor actuales
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

        let action = 'REPICE_INVOICE';
        let newPlate: string | null = null;

        if (newVehicleId) {
            // OTRO CONDUCTOR: sacar de la ruta actual, queda libre en EST-15
            await client.query(
                `DELETE FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
                [routeId, invoiceId]
            );
            const newVehRes = await client.query(
                `SELECT v.plate, d.name AS driver_name
                 FROM vehicles v
                 LEFT JOIN assignments a ON a.vehicle_id::text = v.id::text AND a.is_active = true
                 LEFT JOIN drivers d ON d.id::text = a.driver_id::text
                 WHERE v.id::text = $1 LIMIT 1`,
                [newVehicleId]
            );
            newPlate = newVehRes.rows[0]?.plate || null;
            action   = 'REPICE_REASSIGN';
        } else {
            // MISMO CONDUCTOR: mantener en ruta, actualizar timestamp
            await client.query(
                `UPDATE route_invoices SET assigned_at = NOW()
                 WHERE route_id::text = $1::text AND invoice_id = $2`,
                [routeId, invoiceId]
            );
        }

        // 4. Registrar histórico
        const obs = `repice: ${observations || ''}`;
        await client.query(
            `INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, previous_plate, new_plate, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [routeId, invoiceId, action, userId || null, prevPlate, newPlate,
             JSON.stringify({ observations: obs, driver_name: driverName, new_vehicle_id: newVehicleId || null, timestamp: new Date().toISOString() })]
        );

        await client.query('COMMIT');

        // Aprender del fallo: penalizar zona para este vehículo (fire-and-forget)
        try {
          const vRes = await pool.query(`SELECT vehicle_id FROM routes WHERE id::text = $1 LIMIT 1`, [routeId]);
          const vId = vRes.rows[0]?.vehicle_id;
          if (vId) {
            const invInfo = await pool.query(`
              SELECT COALESCE(di.city, '') AS city, COALESCE(di.neighborhood, '') AS neighborhood, COALESCE(di.address, '') AS address
              FROM document_items di
              WHERE TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = $1
                 OR CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) = $1
              LIMIT 1
            `, [invoiceId]);
            if (invInfo.rows[0]?.city) {
              const { city, neighborhood, address } = invInfo.rows[0];
              pool.query(`UPDATE routing_patterns SET strength = GREATEST(0, strength - 0.5), last_used = NOW()
                WHERE city = $1 AND vehicle_id = $2 AND neighborhood = $3`,
                [city.toUpperCase().trim(), vId, neighborhood.toUpperCase().trim()]).catch(() => {});
              if (address && address !== 'S/D') {
                const addrKey = `${address.trim()}|${city.toUpperCase().trim()}`.toLowerCase();
                pool.query(`UPDATE delivery_patterns SET strength = GREATEST(0, strength - 0.5), last_used = NOW()
                  WHERE address_key = $1 AND vehicle_id = $2`,
                  [addrKey, vId]).catch(() => {});
              }
            }
          }
        } catch { /* non-critical */ }

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

// ─── POST /routes/learn-failure ──────────────────────────────────────────────
// Penaliza patrones de ruteo cuando una entrega falla (repice, devolución, no encontrado).
// Decrementa strength con piso en 0 para que el vehículo pierda preferencia por esa zona.
export const learnFromFailure = async (req: Request, res: Response) => {
  const { vehicleId, stops, penalty = 1 } = req.body as {
    vehicleId: string;
    stops: Array<{ city: string; neighborhood?: string; address?: string; clientId?: string }>;
    penalty?: number;
  };
  if (!vehicleId || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: 'vehicleId y stops[] son requeridos' });
  }
  const p = Math.max(0.5, Math.min(3, Number(penalty) || 1)); // rango [0.5, 3]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stop of stops) {
      const city = String(stop.city || '').toUpperCase().trim();
      const neighborhood = String(stop.neighborhood || '').toUpperCase().trim();
      if (!city) continue;

      // Reducir fuerza territorial — piso en 0
      await client.query(`
        UPDATE routing_patterns
        SET strength = GREATEST(0, strength - $3), last_used = NOW()
        WHERE city = $1 AND vehicle_id = $2 AND neighborhood = $4
      `, [city, vehicleId, p, neighborhood]);

      // Reducir fuerza de dirección exacta — piso en 0
      const address = String(stop.address || '').trim();
      if (address && address !== 'S/D') {
        const addrKey = `${address}|${city}`.toLowerCase();
        await client.query(`
          UPDATE delivery_patterns
          SET strength = GREATEST(0, strength - $2), last_used = NOW()
          WHERE address_key = $1 AND vehicle_id = $3
        `, [addrKey, p, vehicleId]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, penalized: stops.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-LEARN-FAIL-ERR]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// ─── POST /routes/fail-invoice ───────────────────────────────────────────────
// Marca una factura como fallida en su ruta actual y la redistribuye
// automáticamente a la ruta activa hoy con más capacidad disponible y
// más cercana geográficamente. Si no hay ruta que la absorba, la deja
// libre (EST-03) para que pueda entrar en una 2ª vuelta o turno siguiente.
export const failAndReassignInvoice = async (req: Request, res: Response) => {
  const { routeId, invoiceId, reason = 'NO_ENTREGADO', userId } = req.body as {
    routeId: string;
    invoiceId: string;
    reason?: string;
    userId?: string;
  };
  if (!routeId || !invoiceId) {
    return res.status(400).json({ success: false, error: 'routeId e invoiceId son requeridos' });
  }

  // Distancia Haversine inline para evaluación de rutas candidatas
  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verificar que la factura pertenece a la ruta indicada
    const check = await client.query(
      `SELECT 1 FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
      [routeId, invoiceId]
    );
    if (!check.rowCount) throw new Error('La factura no pertenece a esta ruta');

    // 2. Obtener datos de la factura (lat, lng, volumen, ciudad, barrio, dirección)
    const invData = await client.query(`
      SELECT
        CAST(NULLIF(TRIM(di.latitude::text), '') AS FLOAT)   AS lat,
        CAST(NULLIF(TRIM(di.longitude::text), '')AS FLOAT)   AS lng,
        COALESCE(NULLIF(TRIM(di.volume::text), ''), '0')     AS vol,
        COALESCE(di.city, '')                                AS city,
        COALESCE(di.neighborhood, '')                        AS neighborhood,
        COALESCE(di.address, '')                             AS address
      FROM document_items di
      WHERE TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = $1
         OR CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) = $1
      LIMIT 1
    `, [invoiceId]);
    const inv = invData.rows[0] || {};
    const invLat = Number(inv.lat) || 0;
    const invLng = Number(inv.lng) || 0;
    const invVol = Number(inv.vol) || 0;

    // 3. Quitar de la ruta actual
    await client.query(
      `DELETE FROM route_invoices WHERE route_id::text = $1::text AND invoice_id = $2`,
      [routeId, invoiceId]
    );

    // 4. Buscar rutas activas hoy (excluir la actual y anuladas)
    const candidates = await client.query(`
      SELECT
        r.id::text                                           AS route_id,
        COALESCE(v.capacity_m3, 30)::float                  AS capacity_m3,
        COALESCE(r.total_volume_m3, 0)::float               AS loaded_m3,
        COALESCE(AVG(CAST(NULLIF(TRIM(di.latitude::text), '') AS FLOAT)), 0)  AS centroid_lat,
        COALESCE(AVG(CAST(NULLIF(TRIM(di.longitude::text),'') AS FLOAT)), 0)  AS centroid_lng
      FROM routes r
      LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
      LEFT JOIN route_invoices ri ON ri.route_id::text = r.id::text
      LEFT JOIN document_items di ON (
        TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
      ) AND di.latitude IS NOT NULL AND TRIM(di.latitude::text) != ''
      WHERE r.created_at >= CURRENT_DATE
        AND r.id::text != $1::text
        AND r.status_id NOT IN ('EST-16', 'anulada')
      GROUP BY r.id, v.capacity_m3, r.total_volume_m3
    `, [routeId]);

    // 5. Elegir la ruta más cercana con capacidad disponible (≤90% tras agregar)
    let bestRouteId: string | null = null;
    let bestDist = Infinity;
    for (const row of candidates.rows) {
      const cap = Number(row.capacity_m3);
      const loaded = Number(row.loaded_m3);
      if (loaded + invVol > cap * 0.90) continue; // sin capacidad
      if (Number(row.centroid_lat) === 0) continue; // sin coordenadas
      const d = haversine(invLat || Number(row.centroid_lat), invLng || Number(row.centroid_lng),
                           Number(row.centroid_lat), Number(row.centroid_lng));
      if (d < bestDist) { bestDist = d; bestRouteId = row.route_id; }
    }

    // 6. Reasignar o liberar
    if (bestRouteId) {
      await client.query(
        `INSERT INTO route_invoices (route_id, invoice_id, assigned_at)
         VALUES ($1::uuid, $2, NOW())
         ON CONFLICT (route_id, invoice_id) DO NOTHING`,
        [bestRouteId, invoiceId]
      );
      // Actualizar volumen de la ruta receptora
      await client.query(
        `UPDATE routes SET total_volume_m3 = COALESCE(total_volume_m3, 0) + $2
         WHERE id::text = $1`,
        [bestRouteId, invVol]
      );
    } else {
      // Sin ruta disponible → liberar para despacho posterior (EST-03)
      await client.query(`
        UPDATE document_items SET item_status = 'EST-03'
        WHERE TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1
           OR CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
      `, [invoiceId]);
    }

    // 7. Log del movimiento
    const plateRes = await client.query(
      `SELECT v.plate FROM routes r LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text WHERE r.id::text = $1 LIMIT 1`,
      [routeId]
    );
    await client.query(`
      INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, previous_plate, details)
      VALUES ($1, $2, 'FAIL_INVOICE', $3, $4, $5)
    `, [routeId, invoiceId, userId || null, plateRes.rows[0]?.plate || null,
        JSON.stringify({ reason, reassignedTo: bestRouteId, distKm: bestDist < Infinity ? Math.round(bestDist * 10) / 10 : null, timestamp: new Date().toISOString() })
    ]);

    // 8. Actualizar volumen de la ruta original
    await client.query(`
      UPDATE routes SET total_volume_m3 = GREATEST(0, COALESCE(total_volume_m3, 0) - $2)
      WHERE id::text = $1
    `, [routeId, invVol]);

    await client.query('COMMIT');

    // 9. Aprender del fallo (fire-and-forget) — penalizar zona para este vehículo
    if (inv.city) {
      const vehicleRes = await pool.query(
        `SELECT vehicle_id FROM routes WHERE id::text = $1 LIMIT 1`, [routeId]
      );
      const vehicleId = vehicleRes.rows[0]?.vehicle_id;
      if (vehicleId) {
        pool.query(`
          UPDATE routing_patterns
          SET strength = GREATEST(0, strength - 1), last_used = NOW()
          WHERE city = $1 AND vehicle_id = $2 AND neighborhood = $3
        `, [String(inv.city).toUpperCase().trim(), vehicleId, String(inv.neighborhood).toUpperCase().trim()])
        .catch(() => {});
        if (inv.address && inv.address !== 'S/D') {
          const addrKey = `${String(inv.address).trim()}|${String(inv.city).toUpperCase().trim()}`.toLowerCase();
          pool.query(`
            UPDATE delivery_patterns
            SET strength = GREATEST(0, strength - 1), last_used = NOW()
            WHERE address_key = $1 AND vehicle_id = $2
          `, [addrKey, vehicleId]).catch(() => {});
        }
      }
    }

    res.json({ success: true, reassignedTo: bestRouteId, distKm: bestDist < Infinity ? Math.round(bestDist * 10) / 10 : null });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-FAIL-INVOICE-ERR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

export const getDailyKPIs = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT r.id)::int                                        AS routes_today,
        COALESCE(SUM(r.total_volume_m3), 0)::numeric                    AS total_volume_m3,
        COALESCE(AVG(NULLIF(r.utilization_pct, 0)), 0)::numeric         AS avg_utilization,
        COUNT(DISTINCT ri.invoice_id)::int                               AS invoices_assigned,
        COUNT(DISTINCT CASE WHEN di.item_status = 'EST-12' THEN ri.invoice_id END)::int  AS invoices_delivered,
        COUNT(DISTINCT CASE WHEN di.item_status = 'EST-13' THEN ri.invoice_id END)::int  AS invoices_returned,
        COUNT(DISTINCT CASE WHEN di.item_status = 'EST-15' THEN ri.invoice_id END)::int  AS invoices_repice,
        COUNT(DISTINCT CASE WHEN r.shift = 2 THEN r.id END)::int        AS shift2_routes,
        COUNT(DISTINCT r.vehicle_id)::int                                AS vehicles_active
      FROM routes r
      LEFT JOIN route_invoices ri ON ri.route_id::text = r.id::text
      LEFT JOIN document_items di ON (
        TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
        OR CONCAT(di.document_id::text, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
      )
      WHERE r.created_at >= CURRENT_DATE
        AND r.status_id NOT IN ('EST-16')
    `);
    res.json(result.rows[0] || {});
  } catch (err: any) {
    console.error('[M7-KPI-ERR]', err.message);
    res.status(500).json({ error: 'Error al obtener KPIs' });
  }
};

// ─── POST /routes/resolve-coords ─────────────────────────────────────────────
// Para cada factura recibe {customerName, city, address, invoiceId} y devuelve
// las coordenadas más recientes encontradas en document_items para ese cliente.
// Así se aprovecha el historial real de entregas — clientes recurrentes reciben
// sus coordenadas exactas sin geocodificación externa.
export const resolveCustomerCoords = async (req: Request, res: Response) => {
  const { invoices, clientId } = req.body as {
    invoices: { invoiceId: string; customerName: string; city: string; address?: string }[];
    clientId?: string;
  };
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res.json({ coords: {} });
  }

  try {
    // Construir lista de (customer_name, city) únicos para buscar en batch
    const pairs = [...new Set(
      invoices
        .filter(i => i.customerName)
        .map(i => `${i.customerName.trim().toUpperCase()}||${(i.city || '').trim().toUpperCase()}`)
    )];

    if (pairs.length === 0) return res.json({ coords: {} });

    // Query: última posición conocida por cliente+ciudad, lat/lng != 0
    const rows = await pool.query<{
      customer_name: string; city: string;
      latitude: string; longitude: string;
    }>(`
      SELECT DISTINCT ON (UPPER(TRIM(customer_name)), UPPER(TRIM(COALESCE(city, ''))))
        TRIM(customer_name)                        AS customer_name,
        TRIM(COALESCE(city, ''))                   AS city,
        latitude::text,
        longitude::text
      FROM document_items
      WHERE customer_name IS NOT NULL
        AND latitude  IS NOT NULL AND latitude  <> 0
        AND longitude IS NOT NULL AND longitude <> 0
        AND (latitude  BETWEEN -90   AND 90)
        AND (longitude BETWEEN -180  AND 180)
        ${clientId ? 'AND client_id = $1' : ''}
      ORDER BY
        UPPER(TRIM(customer_name)),
        UPPER(TRIM(COALESCE(city, ''))),
        updated_at DESC NULLS LAST
    `, clientId ? [clientId] : []);

    // Construir mapa customerKey → coords
    const coordMap: Record<string, { lat: number; lng: number }> = {};
    for (const row of rows.rows) {
      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;
      const key = `${row.customer_name.toUpperCase()}||${row.city.toUpperCase()}`;
      coordMap[key] = { lat, lng };
    }

    // Mapear invoiceId → coords
    const result: Record<string, { lat: number; lng: number }> = {};
    for (const inv of invoices) {
      const key = `${(inv.customerName || '').trim().toUpperCase()}||${(inv.city || '').trim().toUpperCase()}`;
      if (coordMap[key]) result[inv.invoiceId] = coordMap[key];
    }

    res.json({ coords: result, resolved: Object.keys(result).length, total: invoices.length });
  } catch (err: any) {
    console.error('[M7-RESOLVE-COORDS]', err.message);
    res.json({ coords: {} }); // fallo silencioso — frontend usa fallback
  }
};

export const searchRepiceInvoice = async (req: Request, res: Response) => {
    const { invoiceNumber } = req.query;
    if (!invoiceNumber) {
        return res.status(400).json({ success: false, error: 'invoiceNumber es requerido' });
    }

    try {
        const result = await pool.query(
            `SELECT
                di.invoice,
                di.order_number,
                di.item_status,
                di.document_id,
                CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) AS invoice_id,
                di.customer_name,
                di.address,
                di.city,
                r.id AS route_id,
                r.created_at AS route_date,
                v.plate,
                v.id AS vehicle_id
             FROM document_items di
             LEFT JOIN route_invoices ri ON ri.invoice_id = CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)))
             LEFT JOIN routes r ON r.id::text = ri.route_id::text
             LEFT JOIN vehicles v ON v.id = r.vehicle_id
             WHERE di.item_status = 'EST-15'
               AND (
                 TRIM(UPPER(di.invoice)) = TRIM(UPPER($1))
                 OR TRIM(UPPER(di.order_number)) = TRIM(UPPER($1))
               )
             ORDER BY r.created_at DESC
             LIMIT 1`,
            [invoiceNumber as string]
        );

        if (!result.rowCount || result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Factura no encontrada en estado REPICE (EST-15)' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        console.error('[M7-SEARCH-REPICE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const assignRouteInvoice = async (req: Request, res: Response) => {
    const { routeId, invoiceId, userId, isRepice } = req.body;
    if (!routeId || !invoiceId) {
        return res.status(400).json({ success: false, error: 'routeId e invoiceId son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (isRepice) {
            // Para REPICE: eliminar de cualquier ruta anterior y reasignar sin cambiar item_status
            await client.query(
                `DELETE FROM route_invoices WHERE invoice_id = $1`,
                [invoiceId]
            );
        } else {
            // 1. Verificar si la factura ya está asignada a alguna otra ruta activa
            const checkActive = await client.query(
                `SELECT r.id, v.plate
                 FROM route_invoices ri
                 JOIN routes r ON r.id::text = ri.route_id::text
                 LEFT JOIN vehicles v ON v.id = r.vehicle_id
                 WHERE ri.invoice_id = $1 AND r.status_id NOT IN ('EST-16', 'anulada')`,
                [invoiceId]
            );
            if (checkActive.rowCount && checkActive.rowCount > 0) {
                throw new Error(`La factura ya está asignada a la ruta activa del vehículo ${checkActive.rows[0].plate}`);
            }
        }

        // 2. Obtener el volumen de la factura
        const volRes = await client.query(
            `SELECT SUM(COALESCE(volume, 0))::float as vol
             FROM document_items
             WHERE CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
                OR TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1`,
            [invoiceId]
        );
        const invVol = volRes.rows[0]?.vol || 0;

        // 3. Insertar en route_invoices
        await client.query(
            `INSERT INTO route_invoices (route_id, invoice_id, created_at, assigned_at)
             VALUES ($1, $2, NOW(), NOW())
             ON CONFLICT (route_id, invoice_id) DO NOTHING`,
            [routeId, invoiceId]
        );

        // 4. Actualizar item_status: EST-10 para asignación normal, EST-15 se mantiene para REPICE
        if (!isRepice) {
            await client.query(
                `UPDATE document_items SET item_status = 'EST-10'
                 WHERE CONCAT(document_id::text, '_', TRIM(COALESCE(NULLIF(invoice,''), order_number))) = $1
                    OR TRIM(COALESCE(NULLIF(invoice,''), order_number)) = $1`,
                [invoiceId]
            );
        }

        // 5. Actualizar volumen de la ruta
        await client.query(
            `UPDATE routes SET total_volume_m3 = COALESCE(total_volume_m3, 0) + $2
             WHERE id::text = $1`,
            [routeId, invVol]
        );

        // 6. Recalcular utilization_pct si la capacidad es válida
        await client.query(
            `UPDATE routes 
             SET utilization_pct = CASE WHEN COALESCE(vehicle_capacity_m3, 0) > 0 
                                        THEN (total_volume_m3 / vehicle_capacity_m3) * 100 
                                        ELSE 0 END
             WHERE id::text = $1`,
            [routeId]
        );

        // 7. Registrar en log
        const plateRes = await client.query(
            `SELECT v.plate FROM routes r LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text WHERE r.id::text = $1::text LIMIT 1`,
            [routeId]
        );
        const plate = plateRes.rows[0]?.plate || null;
        await client.query(
            `INSERT INTO route_modifications_log (route_id, invoice_id, action, user_id, new_plate, details)
             VALUES ($1, $2, 'ASSIGN_INVOICE', $3, $4, $5)`,
            [routeId, invoiceId, userId || null, plate, JSON.stringify({ observations: 'Asignado directamente desde gestión de ruta', timestamp: new Date().toISOString() })]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-ASSIGN-INVOICE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
