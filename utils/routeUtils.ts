import { Invoice, Vehicle } from '../types';
import {
  DISPATCH_DEPARTURE_HOUR,
  AVG_MINUTES_PER_STOP,
  LARGE_VEHICLE_THRESHOLD_M3,
  RESTRICTED_NEIGHBORHOODS,
  CITY_TO_CORRIDOR,
  CORRIDOR_ADJACENT,
  CONGESTION_ZONES,
  TUNEL_ORIENTE_FIXED_MIN,
  ORBIT_HUB_ORIGIN,
  normalizeCityName,
  MAX_ROUTE_MINUTES,
  type ViaCorridor,
} from '../config/routeConfig';

export interface SuggestedRoute {
  id: string;
  vehicle: Vehicle;
  assignedInvoices: Invoice[];
  totalVolume: number;
  utilization: number;
  city: string;
}

export interface RoutingPattern {
    city: string;
    vehicle_id: string;
    strength: number;
}

/**
 * Calcula el volumen total de un conjunto de facturas
 */
export function calculateTotalVolume(invoices: Invoice[]): number {
    return invoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0);
}

/**
 * Calcula el porcentaje de utilización de un vehículo
 */
export function calculateUtilization(loadVolume: number, vehicleCapacity: number): number {
    const capacity = vehicleCapacity > 0 ? vehicleCapacity : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
    return Math.round((loadVolume / capacity) * 100);
}

/**
 * Normaliza ciudad para comparación
 */
export function normalizeCityKey(city: string): string {
    if (!city || city.trim() === '') return 'SIN_CIUDAD';
    return city
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

/**
 * Detecta si una factura tiene prioridad basándose en palabras clave
 */
export function detectPriority(notes: string): boolean {
    const priorityKeywords = ['URGENTE', 'PRIMERA HORA', 'PRIORIDAD'];
    const normalizedNotes = notes.toUpperCase();
    return priorityKeywords.some(kw => normalizedNotes.includes(kw));
}

/**
 * Detecta hora específica en las notas
 */
export function detectTime(notes: string): string | null {
    const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|PARA LAS|A LAS)\b/i;
    const match = notes.match(timeRegex);
    return match ? match[0].trim() : null;
}

/**
 * Convierte un string de hora detectada a minutos desde medianoche.
 * Ej: "9 AM" → 540, "2:30 PM" → 870
 * Retorna null si no se puede parsear.
 */
export function parseDetectedTimeToMinutes(timeStr: string): number | null {
    if (!timeStr) return null;
    const upper = timeStr.toUpperCase();
    const match = upper.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const meridiem = match[3];
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

/**
 * Verifica si la carga excede la capacidad del vehículo
 * @returns 'critical' si excede 95%, 'warning' si excede WARN_THRESHOLD, 'ok' si está bien
 */
export function checkCapacityStatus(loadVolume: number, vehicleCapacity: number): 'critical' | 'warning' | 'ok' {
    const capacity = vehicleCapacity > 0 ? vehicleCapacity : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
    const utilization = (loadVolume / capacity) * 100;

    if (utilization >= OPTIMIZATION_CONSTANTS.CRITICAL_THRESHOLD * 100) return 'critical';
    if (utilization >= OPTIMIZATION_CONSTANTS.WARN_THRESHOLD * 100) return 'warning';
    return 'ok';
}

/**
 * Obtiene la ciudad dominante de un conjunto de facturas
 */
export function getDominantCity(invoices: Invoice[]): string {
    const cityCounts: { [key: string]: number } = {};

    invoices.forEach(inv => {
        const city = normalizeCityKey(inv.city || '');
        cityCounts[city] = (cityCounts[city] || 0) + 1;
    });

    if (Object.keys(cityCounts).length === 0) return 'SIN_CIUDAD';

    return Object.keys(cityCounts).reduce((a, b) =>
        cityCounts[a] > cityCounts[b] ? a : b
    );
}

/**
 * Calcula déficit de flota
 */
export function calculateFleetDeficit(
    unassignedInvoices: Invoice[],
    availableVehicles: Vehicle[]
): {
    count: number;
    volume: string;
    additionalVehicles: number;
} {
    const vol = calculateTotalVolume(unassignedInvoices);
    const avgCapacity = availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + (Number(v.capacityM3) || 0), 0) / availableVehicles.length
      : 10;
    const additionalVehicles = Math.ceil(vol / (avgCapacity > 0 ? avgCapacity : 10));

    return {
      count: unassignedInvoices.length,
      volume: vol.toFixed(2),
      additionalVehicles
    };
}

/**
 * Estima la hora de llegada a una parada específica.
 * Modelo: hora_salida + (índice_parada × avg_min_por_parada)
 * @param stopIndex índice 0-based de la parada en la ruta
 * @param departureHour hora de salida en formato 24h (default: DISPATCH_DEPARTURE_HOUR)
 * @param avgMinutesPerStop minutos promedio por parada (default: AVG_MINUTES_PER_STOP)
 * @returns string en formato HH:MM
 */
export function estimateStopArrival(
    stopIndex: number,
    departureHour: number = DISPATCH_DEPARTURE_HOUR,
    avgMinutesPerStop: number = AVG_MINUTES_PER_STOP
): string {
    const totalMinutes = departureHour * 60 + stopIndex * avgMinutesPerStop;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Estima la hora de retorno estimada para una ruta completa.
 */
export function estimateRouteReturn(
    stopCount: number,
    departureHour: number = DISPATCH_DEPARTURE_HOUR,
    avgMinutesPerStop: number = AVG_MINUTES_PER_STOP
): string {
    return estimateStopArrival(stopCount, departureHour, avgMinutesPerStop);
}

/**
 * Rebalancea una sola ruta tras un cambio manual (REMOVE).
 * Intenta completar la carga hasta TARGET_UTILIZATION desde facturas sin asignar.
 * Operación incremental — no ejecuta el algoritmo completo.
 */
export function rebalanceSingleRoute(
    route: SuggestedRoute,
    unassigned: Invoice[]
): { updatedRoute: SuggestedRoute; addedInvoiceIds: Set<string> } {
    const cap = Number(route.vehicle.capacityM3) > 0
        ? Number(route.vehicle.capacityM3)
        : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;

    const targetLoad = cap * OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION;
    let currentVol = route.totalVolume;

    // Solo rebalancear si estamos por debajo del objetivo
    if (currentVol >= targetLoad) {
        return { updatedRoute: route, addedInvoiceIds: new Set() };
    }

    const load = [...route.assignedInvoices];
    const addedInvoiceIds = new Set<string>();

    // Última parada conocida como referencia de proximidad
    const lastStop = load[load.length - 1];
    const lastLat = lastStop ? Number((lastStop as any).lat || 0) : 0;
    const lastLng = lastStop ? Number((lastStop as any).lng || 0) : 0;

    // Ordenar candidatos por proximidad a la última parada
    const candidates = [...unassigned].sort((a, b) => {
        const dA = Math.sqrt(
            Math.pow(Number((a as any).lat || 0) - lastLat, 2) +
            Math.pow(Number((a as any).lng || 0) - lastLng, 2)
        );
        const dB = Math.sqrt(
            Math.pow(Number((b as any).lat || 0) - lastLat, 2) +
            Math.pow(Number((b as any).lng || 0) - lastLng, 2)
        );
        return dA - dB;
    });

    const isLargeVehicle = cap > LARGE_VEHICLE_THRESHOLD_M3;

    for (const candidate of candidates) {
        const vol = Number(candidate.volumeM3) || 0;
        const neighborhoodKey = String((candidate as any).neighborhoodKey || '').toUpperCase().trim();

        // Respetar restricciones de barrio
        if (isLargeVehicle && RESTRICTED_NEIGHBORHOODS.includes(neighborhoodKey)) continue;

        if (currentVol + vol <= cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) {
            load.push(candidate);
            currentVol += vol;
            addedInvoiceIds.add(candidate.id);
            if (currentVol >= targetLoad) break;
        }
    }

    const updatedRoute: SuggestedRoute = {
        ...route,
        assignedInvoices: load,
        totalVolume: Number(currentVol.toFixed(2)),
        utilization: Math.round((currentVol / cap) * 100)
    };

    return { updatedRoute, addedInvoiceIds };
}

/**
 * Constantes de optimización M7 — fuente de verdad para el algoritmo ORBIT
 */
export const OPTIMIZATION_CONSTANTS = {
    TARGET_UTILIZATION: 0.85,  // 85% — objetivo de carga ideal (deja margen operativo)
    MAX_UTILIZATION: 0.90,     // 90% — techo máximo (regla M7: no superar 90%)
    CRITICAL_THRESHOLD: 0.92,  // 92% — bloqueo crítico de sobrecarga
    WARN_THRESHOLD: 0.85,      // 85% — umbral de advertencia amarilla
    DEFAULT_CAPACITY: 30,      // m³ por defecto si el vehículo no tiene capacidad definida
    OPTIMIZATION_DELAY: 1200,  // ms de delay para la animación de optimización
    TARGET_INVOICES: 23,       // promedio objetivo de facturas por ruta
    MAX_INVOICES: 28,          // máximo absoluto de facturas por ruta (no se puede superar)
};

// ─── MEJORA 1: Haversine ─────────────────────────────────────────────────────
/**
 * Calcula la distancia real en km entre dos coordenadas usando la fórmula
 * Haversine (superficie terrestre). Más precisa que la euclidiana,
 * especialmente para rutas intermunicipales y zonas con diferencias de altitud.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Coordenadas default de "sin geocodificar" (Medellín centro) */
const DEFAULT_LAT = 6.2518;
const DEFAULT_LNG = -75.5636;
const DEFAULT_COORDS_TOLERANCE = 0.0001; // ~11 metros de tolerancia

/**
 * Detecta si unas coordenadas son las default (factura sin geocodificar).
 */
export function hasDefaultCoords(lat: number, lng: number): boolean {
    return Math.abs(lat - DEFAULT_LAT) < DEFAULT_COORDS_TOLERANCE
        && Math.abs(lng - DEFAULT_LNG) < DEFAULT_COORDS_TOLERANCE;
}

// ─── MEJORA 4: 2-opt post-greedy ─────────────────────────────────────────────
/**
 * Aplica optimización 2-opt sobre las facturas de una ruta.
 * Intercambia pares de segmentos mientras la distancia total mejore.
 * Reduce el recorrido total 10–25% sin cambiar la carga del vehículo.
 *
 * @param stops   Facturas ordenadas por el greedy
 * @param hubLat  Latitud del hub de origen
 * @param hubLng  Longitud del hub de origen
 * @returns       Nueva lista de facturas reordenadas (o la original si no mejora)
 */
// ─── CORREDOR VIAL ────────────────────────────────────────────────────────────
/**
 * Clasifica una factura en su corredor vial.
 * Jerarquía: macro-región por nombre de ciudad → corredor por coords GPS → fallback.
 */
export function classifyCorridor(lat: number, lng: number, cityStr: string): ViaCorridor {
  // Normalizar primero (resuelve códigos DANE y abreviaciones)
  const normalized = normalizeCityName(cityStr);
  const city = normalized.toUpperCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Buscar en el mapa de ciudades (normalizado sin tildes)
  for (const [key, corridor] of Object.entries(CITY_TO_CORRIDOR)) {
    const keyNorm = key.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (city === keyNorm || city.includes(keyNorm)) return corridor as ViaCorridor;
  }

  // Fallback por coordenadas GPS — expresado en offsets relativos al hub de despacho
  // para que funcione en cualquier ciudad (no hardcoded a Medellín).
  // Equivalencia para el hub actual (La Tablaza, Antioquia):
  //   dlat > 0.31 → lat > 6.42 (NORTE_LEJANO)
  //   dlat > 0.20 → lat > 6.31 (NORTE)
  //   etc.
  if (lat === 0 || lng === 0) return 'MED_CENTRO';

  const dlat = lat - ORBIT_HUB_ORIGIN.lat;
  const dlng = lng - ORBIT_HUB_ORIGIN.lng;

  // Separación este/oeste: río Medellín ≈ lng -75.578 → offset 0.063 desde hub.
  // Reducido a 0.055 para que el corredor norte-occidente (Castilla/Robledo/Bello
  // sur) quede en MED_OCC en lugar de NORTE cuando dlat está entre 0.095 y 0.155.
  const isEast = dlng > 0.055;

  if (dlat > 0.31)  return 'NORTE_LEJANO';
  if (dlat > 0.20)  return 'NORTE';
  // Bello sur / Manrique norte (dlat 0.155-0.20): zona de transición
  if (dlat > 0.155) return isEast ? 'MED_ORI'    : 'MED_OCC';
  // Laureles/Belén/Robledo vs Aranjuez/Argentina (dlat 0.095-0.155)
  if (dlat > 0.095) return isEast ? 'MED_CENTRO' : 'MED_OCC';
  // Envigado vs Itagüí/Sabaneta (dlat 0.045-0.095)
  if (dlat > 0.045) return isEast ? 'ENVIGADO'   : 'SUR';
  if (dlat > -0.01) return 'SUR';
  return 'SUR_LEJANO';
}

/**
 * Verifica si dos corredores pueden ir en la misma ruta.
 * Las macro-regiones ORIENTE_ANT y OCCIDENTE_ANT nunca se mezclan con nada.
 */
// NORTE_GROUP and SUR_GROUP are absolute opposites — the río Medellín
// physically separates them and the viaducts only connect center zones.
const _NORTE_GROUP = new Set<ViaCorridor>(['NORTE_LEJANO', 'NORTE']);
const _SUR_GROUP = new Set<ViaCorridor>(['SUR', 'SUR_LEJANO']);

export function corridorsCompatible(a: ViaCorridor, b: ViaCorridor): boolean {
  if (a === b) return true;
  if (a === 'ORIENTE_ANT' || b === 'ORIENTE_ANT') return false;
  if (a === 'OCCIDENTE_ANT' || b === 'OCCIDENTE_ANT') return false;
  // Hard river rule: NORTE never mixes with SUR regardless of adjacency chain
  if (_NORTE_GROUP.has(a) && _SUR_GROUP.has(b)) return false;
  if (_SUR_GROUP.has(a) && _NORTE_GROUP.has(b)) return false;
  return CORRIDOR_ADJACENT[a]?.includes(b) ?? false;
}

// ─── CONGESTIÓN Y DURACIÓN DE RUTA ───────────────────────────────────────────
/**
 * Retorna el multiplicador de tiempo para una coordenada y hora de salida dada.
 * Si la coords caen en una zona de congestión, aplica el factor pico o fuera de pico.
 */
export function getCongestionMultiplier(lat: number, lng: number, departureHourLocal: number): number {
  const isPeak = (departureHourLocal >= 7 && departureHourLocal <= 9)
              || (departureHourLocal >= 17 && departureHourLocal <= 19);
  let maxMultiplier = 1.0;
  for (const zone of CONGESTION_ZONES) {
    const [minLat, maxLat, minLng, maxLng] = zone.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      const m = isPeak ? zone.multiplierPeak : zone.multiplierOffPeak;
      if (m > maxMultiplier) maxMultiplier = m;
    }
  }
  return maxMultiplier;
}

/**
 * Estima el tiempo de entrega real en una parada basado en la carga.
 * Reemplaza la constante AVG_MINUTES_PER_STOP (25 min para todos).
 * - BASE: 8 min (estacionar, buscar dirección, firmar)
 * - +0.3 min por ítem (descargar cada caja/unidad)
 * - +1.5 min por m³ (volumen extra requiere más maniobras)
 * - Mínimo 5 min, máximo 45 min
 */
export function estimateDeliveryMinutes(
    stop: { volumeM3?: number | null; totalItems?: number | null; items?: any[] | null; [key: string]: any }
): number {
    const BASE = 8;
    const MIN_PER_ITEM = 0.3;
    const MIN_PER_M3 = 1.5;
    const items = Number(stop.totalItems ?? stop.items?.length ?? 1);
    const vol = Number(stop.volumeM3 ?? 0);
    const estimated = BASE + (items * MIN_PER_ITEM) + (vol * MIN_PER_M3);
    return Math.min(45, Math.max(5, Math.round(estimated)));
}

/**
 * Estima la duración total de una ruta en minutos.
 * Usa Haversine para distancia + velocidad promedio + tiempo de entrega + congestión.
 * Agrega TUNEL_ORIENTE_FIXED_MIN si el corredor es ORIENTE_ANT.
 *
 * Modelo: velocidad promedio urbana 22 km/h, suburbana 45 km/h.
 * Tiempo de entrega por parada: estimateDeliveryMinutes (variable según carga).
 */
export function estimateRouteTotalMinutes(
  stops: Array<{ lat?: number | null; lng?: number | null; corridor?: ViaCorridor; [key: string]: any }>,
  hubLat: number,
  hubLng: number,
  departureHour: number = DISPATCH_DEPARTURE_HOUR,
  travelTimeFn?: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): number {
  if (stops.length === 0) return 0;

  const URBAN_SPEED_KMH = 22;
  const SUBURBAN_SPEED_KMH = 40;

  const isOriente = stops.some(s => (s as any).corridor === 'ORIENTE_ANT');

  const getLat = (s: typeof stops[0]) => Number(s.lat || hubLat);
  const getLng = (s: typeof stops[0]) => Number(s.lng || hubLng);

  let totalMinutes = isOriente ? TUNEL_ORIENTE_FIXED_MIN : 0;

  // Hub → primera parada
  const firstLat = getLat(stops[0]);
  const firstLng = getLng(stops[0]);
  const distFirst = haversineKm(hubLat, hubLng, firstLat, firstLng);
  const speedFirst = distFirst > 15 ? SUBURBAN_SPEED_KMH : URBAN_SPEED_KMH;
  const congFirst = getCongestionMultiplier(firstLat, firstLng, departureHour);
  const travelMinFirst = travelTimeFn ? travelTimeFn(hubLat, hubLng, firstLat, firstLng) : (distFirst / speedFirst) * 60 * congFirst;
  totalMinutes += travelMinFirst;

  // Entre paradas consecutivas + tiempo de entrega por parada
  for (let i = 0; i < stops.length; i++) {
    totalMinutes += estimateDeliveryMinutes(stops[i]);
    if (i < stops.length - 1) {
      const aLat = getLat(stops[i]);
      const aLng = getLng(stops[i]);
      const bLat = getLat(stops[i + 1]);
      const bLng = getLng(stops[i + 1]);
      const dist = haversineKm(aLat, aLng, bLat, bLng);
      const speed = dist > 10 ? SUBURBAN_SPEED_KMH : URBAN_SPEED_KMH;
      const cong = getCongestionMultiplier(bLat, bLng, departureHour);
      const travelMin = travelTimeFn ? travelTimeFn(aLat, aLng, bLat, bLng) : (dist / speed) * 60 * cong;
      totalMinutes += travelMin;
    }
  }

  // Última parada → hub
  const lastLat = getLat(stops[stops.length - 1]);
  const lastLng = getLng(stops[stops.length - 1]);
  const distReturn = haversineKm(lastLat, lastLng, hubLat, hubLng);
  const speedReturn = distReturn > 15 ? SUBURBAN_SPEED_KMH : URBAN_SPEED_KMH;
  const travelMinReturn = travelTimeFn ? travelTimeFn(lastLat, lastLng, hubLat, hubLng) : (distReturn / speedReturn) * 60;
  totalMinutes += travelMinReturn;
  if (isOriente) totalMinutes += TUNEL_ORIENTE_FIXED_MIN; // regreso

  return Math.round(totalMinutes);
}

// ─── Llegada estimada por parada ─────────────────────────────────────────────
/**
 * Retorna los minutos transcurridos desde la salida del hub hasta llegar
 * a la parada en `targetIndex` (sin contar el tiempo de entrega en esa parada).
 * Usa la misma lógica de velocidades/congestión que estimateRouteTotalMinutes.
 */
export function estimateArrivalAtStopMinutes(
    stops: Array<{ lat?: number | null; lng?: number | null; corridor?: ViaCorridor; [key: string]: any }>,
    targetIndex: number,
    hubLat: number,
    hubLng: number,
    departureHour: number = DISPATCH_DEPARTURE_HOUR,
    travelTimeFn?: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): number {
    if (stops.length === 0 || targetIndex < 0) return 0;

    const URBAN_SPEED_KMH = 22;
    const SUBURBAN_SPEED_KMH = 40;

    const getLat = (s: typeof stops[0]) => Number(s.lat || hubLat);
    const getLng = (s: typeof stops[0]) => Number(s.lng || hubLng);

    // Hub → primera parada
    const distFirst = haversineKm(hubLat, hubLng, getLat(stops[0]), getLng(stops[0]));
    const speedFirst = distFirst > 15 ? SUBURBAN_SPEED_KMH : URBAN_SPEED_KMH;
    const congFirst = getCongestionMultiplier(getLat(stops[0]), getLng(stops[0]), departureHour);
    let minutes = travelTimeFn
        ? travelTimeFn(hubLat, hubLng, getLat(stops[0]), getLng(stops[0]))
        : (distFirst / speedFirst) * 60 * congFirst;

    for (let i = 0; i < targetIndex; i++) {
        minutes += estimateDeliveryMinutes(stops[i]); // tiempo de entrega en la parada i
        const aLat = getLat(stops[i]);
        const aLng = getLng(stops[i]);
        const bLat = getLat(stops[i + 1]);
        const bLng = getLng(stops[i + 1]);
        const dist = haversineKm(aLat, aLng, bLat, bLng);
        const speed = dist > 10 ? SUBURBAN_SPEED_KMH : URBAN_SPEED_KMH;
        const cong = getCongestionMultiplier(bLat, bLng, departureHour);
        minutes += travelTimeFn ? travelTimeFn(aLat, aLng, bLat, bLng) : (dist / speed) * 60 * cong;
    }

    return Math.round(minutes);
}

/**
 * Retorna true si alguna parada con ventana de tiempo (timeWindowMinutes)
 * sería visitada después de su hora límite en la secuencia dada.
 */
export function routeViolatesTimeWindows(
    stops: Array<{ lat?: number | null; lng?: number | null; [key: string]: any }>,
    hubLat: number,
    hubLng: number,
    departureHour: number = DISPATCH_DEPARTURE_HOUR
): boolean {
    const departureMinutes = departureHour * 60;
    for (let i = 0; i < stops.length; i++) {
        const tw = (stops[i] as any).timeWindowMinutes;
        if (typeof tw !== 'number') continue;
        const arrivalFromDep = estimateArrivalAtStopMinutes(stops, i, hubLat, hubLng, departureHour);
        if (departureMinutes + arrivalFromDep > tw) return true;
    }
    return false;
}

// Max inter-stop distance by corridor type. Prevents routes with large geographic jumps.
const MAX_INTER_STOP_KM: Partial<Record<string, number>> = {
    MED_CENTRO: 4,  NORTE: 5,  SUR: 5,
    NORTE_LEJANO: 10, SUR_LEJANO: 10,
    ORIENTE_ANT: 14, OCCIDENTE_ANT: 14,
};
const DEFAULT_MAX_JUMP_KM = 6;

/**
 * Returns true if any consecutive pair of stops in the sequence exceeds the
 * corridor's max inter-stop distance. Helps prevent routes that zigzag across
 * the city. Only applied when stops carry valid non-default coordinates.
 */
export function routeHasLargeJump(
    stops: Array<{ lat?: number | null; lng?: number | null; [key: string]: any }>,
    hubLat: number,
    hubLng: number,
    corridor?: string
): boolean {
    if (stops.length < 2) return false;
    const maxKm = (corridor ? MAX_INTER_STOP_KM[corridor] : undefined) ?? DEFAULT_MAX_JUMP_KM;
    const getLat = (s: typeof stops[0]) => Number(s.lat || hubLat);
    const getLng = (s: typeof stops[0]) => Number(s.lng || hubLng);
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        const aLat = getLat(a), bLat = getLat(b);
        // Skip pairs where either stop lacks real coords
        if (aLat === hubLat || bLat === hubLat) continue;
        if ((a as any).hasDefaultCoords || (b as any).hasDefaultCoords) continue;
        if (haversineKm(aLat, getLng(a), bLat, getLng(b)) > maxKm) return true;
    }
    return false;
}

export function twoOptImprove(
    stops: Array<{ lat?: number | null; lng?: number | null; [key: string]: any }>,
    hubLat: number,
    hubLng: number,
    distFn?: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): typeof stops {
    if (stops.length < 4) return stops;

    const dist = distFn || haversineKm;
    const getLat = (s: typeof stops[0]) => Number(s.lat || hubLat);
    const getLng = (s: typeof stops[0]) => Number(s.lng || hubLng);

    const hasTW = stops.some(s => typeof (s as any).timeWindowMinutes === 'number');

    const totalDist = (seq: typeof stops): number => {
        let d = dist(hubLat, hubLng, getLat(seq[0]), getLng(seq[0]));
        for (let i = 0; i < seq.length - 1; i++) {
            d += dist(getLat(seq[i]), getLng(seq[i]), getLat(seq[i + 1]), getLng(seq[i + 1]));
        }
        d += dist(getLat(seq[seq.length - 1]), getLng(seq[seq.length - 1]), hubLat, hubLng);
        return d;
    };

    let best = [...stops];
    let bestDist = totalDist(best);
    let improved = true;
    let iterations = 0;
    const maxIterations = 60;

    while (improved && iterations < maxIterations) {
        improved = false;
        iterations++;
        for (let i = 1; i < best.length - 1; i++) {
            for (let k = i + 1; k < best.length; k++) {
                const candidate = [
                    ...best.slice(0, i),
                    ...best.slice(i, k + 1).reverse(),
                    ...best.slice(k + 1)
                ];
                const candidateDist = totalDist(candidate);
                if (candidateDist < bestDist - 0.01) {
                    if (hasTW && routeViolatesTimeWindows(candidate, hubLat, hubLng)) continue;
                    best = candidate;
                    bestDist = candidateDist;
                    improved = true;
                }
            }
        }
    }

    return best;
}

// ─── Función de distancia por red vial (OSRM) ────────────────────────────────
/**
 * Construye una función (lat1,lng1,lat2,lng2)→km usando la matriz OSRM.
 * Para pares no encontrados en la matriz (coordenadas fuera de los puntos
 * originales) cae automáticamente a Haversine.
 *
 * Uso:
 *   const distFn = buildRoadDistFn(points, distMatrix);
 *   twoOptImprove(stops, hubLat, hubLng, distFn);
 */
export function buildRoadDistFn(
    points: Array<{ lat: number; lng: number }>,
    distMatrix: number[][]
): (lat1: number, lng1: number, lat2: number, lng2: number) => number {
    const PREC = 5; // 5 decimales ≈ 1 metro de tolerancia
    const idx = new Map<string, number>();
    points.forEach((p, i) => idx.set(`${Number(p.lat).toFixed(PREC)},${Number(p.lng).toFixed(PREC)}`, i));

    return (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const i = idx.get(`${lat1.toFixed(PREC)},${lng1.toFixed(PREC)}`);
        const j = idx.get(`${lat2.toFixed(PREC)},${lng2.toFixed(PREC)}`);
        if (i !== undefined && j !== undefined && distMatrix[i]?.[j] != null) {
            return distMatrix[i][j];
        }
        return haversineKm(lat1, lng1, lat2, lng2);
    };
}

/**
 * Construye una función (lat1,lng1,lat2,lng2)→minutos usando la matriz de
 * duraciones OSRM. Para pares no encontrados cae a la estimación por velocidad.
 */
export function buildRoadTimeFn(
    points: Array<{ lat: number; lng: number }>,
    durMatrix: number[][]
): (lat1: number, lng1: number, lat2: number, lng2: number) => number {
    const PREC = 5;
    const idx = new Map<string, number>();
    points.forEach((p, i) => idx.set(`${Number(p.lat).toFixed(PREC)},${Number(p.lng).toFixed(PREC)}`, i));

    return (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const i = idx.get(`${lat1.toFixed(PREC)},${lng1.toFixed(PREC)}`);
        const j = idx.get(`${lat2.toFixed(PREC)},${lng2.toFixed(PREC)}`);
        if (i !== undefined && j !== undefined && durMatrix[i]?.[j] != null) {
            return durMatrix[i][j]; // already in minutes
        }
        // Fallback: estimate from speed (urban ~22 km/h)
        const dist = haversineKm(lat1, lng1, lat2, lng2);
        return (dist / 22) * 60;
    };
}

// ─── Or-opt(1) intra-ruta ────────────────────────────────────────────────────
/**
 * Complemento al 2-opt: reubica cada parada individualmente en su posición
 * óptima dentro de la misma ruta. Captura casos que 2-opt no encuentra
 * (paradas aisladas que generan desvíos cortos).
 */
export function orOpt1Intra(
    stops: Array<{ lat?: number | null; lng?: number | null; [key: string]: any }>,
    hubLat: number,
    hubLng: number,
    distFn?: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): typeof stops {
    if (stops.length < 3) return stops;

    const dist = distFn || haversineKm;
    const getLat = (s: typeof stops[0]) => Number(s.lat || hubLat);
    const getLng = (s: typeof stops[0]) => Number(s.lng || hubLng);

    const hasTW = stops.some(s => typeof (s as any).timeWindowMinutes === 'number');

    const totalDist = (seq: typeof stops): number => {
        let d = dist(hubLat, hubLng, getLat(seq[0]), getLng(seq[0]));
        for (let i = 0; i < seq.length - 1; i++) {
            d += dist(getLat(seq[i]), getLng(seq[i]), getLat(seq[i + 1]), getLng(seq[i + 1]));
        }
        d += dist(getLat(seq[seq.length - 1]), getLng(seq[seq.length - 1]), hubLat, hubLng);
        return d;
    };

    // Dominant corridor for jump-distance check
    const corridorCounts = new Map<string, number>();
    stops.forEach(s => { const c = (s as any).corridor; if (c) corridorCounts.set(c, (corridorCounts.get(c) || 0) + 1); });
    const dominantCorridor = [...corridorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    let best = [...stops];
    let bestDist = totalDist(best);
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 40) {
        improved = false;
        iterations++;
        outer: for (let i = 0; i < best.length; i++) {
            const stop = best[i];
            const without = [...best.slice(0, i), ...best.slice(i + 1)];
            for (let j = 0; j <= without.length; j++) {
                if (j === i || j === i - 1) continue;
                const candidate = [...without.slice(0, j), stop, ...without.slice(j)];
                const candidateDist = totalDist(candidate);
                if (candidateDist < bestDist - 0.01) {
                    if (hasTW && routeViolatesTimeWindows(candidate, hubLat, hubLng)) continue;
                    if (routeHasLargeJump(candidate, hubLat, hubLng, dominantCorridor)) continue;
                    best = candidate;
                    bestDist = candidateDist;
                    improved = true;
                    break outer;
                }
            }
        }

        // Or-opt(2): mover pares de paradas consecutivas
        outer2: for (let i = 0; i < best.length - 1; i++) {
            const pair = [best[i], best[i + 1]];
            const without = [...best.slice(0, i), ...best.slice(i + 2)];
            for (let j = 0; j <= without.length; j++) {
                const candidate = [...without.slice(0, j), ...pair, ...without.slice(j)];
                const d = totalDist(candidate);
                if (d < bestDist - 0.01) {
                    if (hasTW && routeViolatesTimeWindows(candidate, hubLat, hubLng)) continue;
                    if (routeHasLargeJump(candidate, hubLat, hubLng, dominantCorridor)) continue;
                    best = candidate; bestDist = d; improved = true; break outer2;
                }
                const candidateRev = [...without.slice(0, j), pair[1], pair[0], ...without.slice(j)];
                const dRev = totalDist(candidateRev);
                if (dRev < bestDist - 0.01) {
                    if (hasTW && routeViolatesTimeWindows(candidateRev, hubLat, hubLng)) continue;
                    if (routeHasLargeJump(candidateRev, hubLat, hubLng, dominantCorridor)) continue;
                    best = candidateRev; bestDist = dRev; improved = true; break outer2;
                }
            }
        }
    }

    return best;
}

// ─── 3-opt (verdaderos movimientos de relocalización de segmento) ─────────────
/**
 * Complementa al 2-opt: encuentra mejoras que requieren romper 3 arcos
 * simultáneamente. Solo evalúa los 4 movimientos "verdaderos" de 3-opt
 * (reordenamiento de segmento B↔C) que 2-opt no puede descubrir.
 * Solo se activa para rutas con ≥12 paradas — por debajo el 2-opt ya converge.
 */
export function threeOptImprove(
    stops: Array<{ lat?: number | null; lng?: number | null; [key: string]: any }>,
    hubLat: number,
    hubLng: number,
    distFn?: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): typeof stops {
    if (stops.length < 12) return stops;

    const dist = distFn || haversineKm;
    const gl = (s: typeof stops[0]) => Number(s.lat || hubLat);
    const gg = (s: typeof stops[0]) => Number(s.lng || hubLng);
    const hasTW = stops.some(s => typeof (s as any).timeWindowMinutes === 'number');

    const totalDist = (seq: typeof stops): number => {
        let d = dist(hubLat, hubLng, gl(seq[0]), gg(seq[0]));
        for (let i = 0; i < seq.length - 1; i++) d += dist(gl(seq[i]), gg(seq[i]), gl(seq[i + 1]), gg(seq[i + 1]));
        d += dist(gl(seq[seq.length - 1]), gg(seq[seq.length - 1]), hubLat, hubLng);
        return d;
    };

    let best = [...stops];
    let bestDist = totalDist(best);
    let improved = true;
    let iter = 0;

    while (improved && iter < 20) {
        improved = false;
        iter++;
        const n = best.length;

        outer: for (let i = 0; i < n - 2; i++) {
            for (let j = i + 1; j < n - 1; j++) {
                for (let k = j + 1; k < n; k++) {
                    const A = best.slice(0, i + 1);
                    const B = best.slice(i + 1, j + 1);
                    const C = best.slice(j + 1, k + 1);
                    const D = best.slice(k + 1);
                    const Brev = [...B].reverse();
                    const Crev = [...C].reverse();

                    // Solo los 4 movimientos verdaderos de 3-opt (B↔C intercambiados)
                    // que el 2-opt no puede descubrir. Los movimientos de inversión de
                    // un solo segmento ya los maneja 2-opt.
                    const candidates: (typeof stops)[] = [
                        [...A, ...C,    ...B,    ...D],
                        [...A, ...Crev, ...B,    ...D],
                        [...A, ...C,    ...Brev, ...D],
                        [...A, ...Crev, ...Brev, ...D],
                    ];

                    for (const candidate of candidates) {
                        const d = totalDist(candidate);
                        if (d < bestDist - 0.01) {
                            if (hasTW && routeViolatesTimeWindows(candidate, hubLat, hubLng)) continue;
                            best = candidate;
                            bestDist = d;
                            improved = true;
                            break outer;
                        }
                    }
                }
            }
        }
    }

    return best;
}

// ─── Or-opt inter-ruta ───────────────────────────────────────────────────────
/**
 * Mueve paradas individuales entre rutas para minimizar la distancia total
 * del sistema. Es el salto más grande en calidad después de 2-opt/Or-opt intra:
 * detecta casos donde una parada "ajena" contamina una ruta y pertenece mejor
 * a una ruta vecina del mismo corredor.
 *
 * Respeta: capacidad máxima, tiempo máximo (MAX_ROUTE_MINUTES), compatibilidad
 * de corredor. Nunca deja una ruta vacía.
 */
export function orOptInterRoute(
    routes: SuggestedRoute[],
    hubLat: number,
    hubLng: number,
    maxRounds: number = 40
): SuggestedRoute[] {
    if (routes.length < 2) return routes;

    const getLat = (inv: Invoice) => Number((inv as any).lat || hubLat);
    const getLng = (inv: Invoice) => Number((inv as any).lng || hubLng);

    const routeDist = (invs: Invoice[]): number => {
        if (invs.length === 0) return 0;
        let d = haversineKm(hubLat, hubLng, getLat(invs[0]), getLng(invs[0]));
        for (let i = 0; i < invs.length - 1; i++) {
            d += haversineKm(getLat(invs[i]), getLng(invs[i]), getLat(invs[i + 1]), getLng(invs[i + 1]));
        }
        d += haversineKm(getLat(invs[invs.length - 1]), getLng(invs[invs.length - 1]), hubLat, hubLng);
        return d;
    };

    let work = routes.map(r => ({ ...r, assignedInvoices: [...r.assignedInvoices] }));

    for (let round = 0; round < maxRounds; round++) {
        let improved = false;

        outer: for (let di = 0; di < work.length; di++) {
            const donor = work[di];
            if (donor.assignedInvoices.length <= 1) continue;
            const donorCap = Number(donor.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;

            for (let ki = 0; ki < donor.assignedInvoices.length; ki++) {
                const inv = donor.assignedInvoices[ki];
                const invVol = Number(inv.volumeM3) || 0;
                const invCorridor: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';

                const donorWithout = [
                    ...donor.assignedInvoices.slice(0, ki),
                    ...donor.assignedInvoices.slice(ki + 1),
                ];
                const distDonorBefore = routeDist(donor.assignedInvoices);
                const distDonorAfter = routeDist(donorWithout);

                let bestGain = 0.05; // mejora mínima 50m para evitar movimientos triviales
                let bestRi = -1;
                let bestPos = -1;

                for (let ri = 0; ri < work.length; ri++) {
                    if (ri === di) continue;
                    const receiver = work[ri];
                    const rCorridor: ViaCorridor = (receiver.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                    if (!corridorsCompatible(invCorridor, rCorridor)) continue;
                    const rCap = Number(receiver.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                    if (receiver.totalVolume + invVol > rCap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) continue;
                    if (receiver.assignedInvoices.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) continue;

                    const distReceiverBefore = routeDist(receiver.assignedInvoices);

                    const invHasTW = typeof (inv as any).timeWindowMinutes === 'number';
                    for (let pos = 0; pos <= receiver.assignedInvoices.length; pos++) {
                        const receiverWith = [
                            ...receiver.assignedInvoices.slice(0, pos),
                            inv,
                            ...receiver.assignedInvoices.slice(pos),
                        ];
                        if (estimateRouteTotalMinutes(receiverWith, hubLat, hubLng) >= MAX_ROUTE_MINUTES) continue;
                        // Verificar que la inserción no rompe ventanas de tiempo existentes
                        if (invHasTW || receiver.assignedInvoices.some(i => typeof (i as any).timeWindowMinutes === 'number')) {
                            if (routeViolatesTimeWindows(receiverWith, hubLat, hubLng)) continue;
                        }
                        const rCorridor2 = (receiver.assignedInvoices[0] as any)?.corridor;
                        if (routeHasLargeJump(receiverWith, hubLat, hubLng, rCorridor2)) continue;
                        const distReceiverAfter = routeDist(receiverWith);
                        const gain = (distDonorBefore + distReceiverBefore) - (distDonorAfter + distReceiverAfter);
                        if (gain > bestGain) {
                            bestGain = gain;
                            bestRi = ri;
                            bestPos = pos;
                        }
                    }
                }

                if (bestRi >= 0) {
                    const receiver = work[bestRi];
                    const rCap = Number(receiver.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                    work[di] = {
                        ...donor,
                        assignedInvoices: donorWithout,
                        totalVolume: Number((donor.totalVolume - invVol).toFixed(4)),
                        utilization: Math.round(((donor.totalVolume - invVol) / donorCap) * 100),
                    };
                    work[bestRi] = {
                        ...receiver,
                        assignedInvoices: [
                            ...receiver.assignedInvoices.slice(0, bestPos),
                            inv,
                            ...receiver.assignedInvoices.slice(bestPos),
                        ],
                        totalVolume: Number((receiver.totalVolume + invVol).toFixed(4)),
                        utilization: Math.round(((receiver.totalVolume + invVol) / rCap) * 100),
                    };
                    improved = true;
                    break outer;
                }
            }
        }

        // ── Or-opt(2): mover pares consecutivos entre rutas si singles no mejoró ──
        if (!improved) {
            outerPair: for (let di = 0; di < work.length; di++) {
                const donor = work[di];
                if (donor.assignedInvoices.length <= 2) continue;
                const donorCap = Number(donor.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;

                for (let ki = 0; ki < donor.assignedInvoices.length - 1; ki++) {
                    const inv1 = donor.assignedInvoices[ki];
                    const inv2 = donor.assignedInvoices[ki + 1];
                    const pairVol = (Number(inv1.volumeM3) || 0) + (Number(inv2.volumeM3) || 0);
                    const inv1Corridor: ViaCorridor = (inv1 as any).corridor || 'MED_CENTRO';
                    const inv2Corridor: ViaCorridor = (inv2 as any).corridor || 'MED_CENTRO';

                    const donorWithout = [
                        ...donor.assignedInvoices.slice(0, ki),
                        ...donor.assignedInvoices.slice(ki + 2),
                    ];
                    const distDonorBefore = routeDist(donor.assignedInvoices);
                    const distDonorAfter = routeDist(donorWithout);

                    let bestGain = 0.05;
                    let bestRi = -1;
                    let bestPos = -1;

                    for (let ri = 0; ri < work.length; ri++) {
                        if (ri === di) continue;
                        const receiver = work[ri];
                        const rCorridor: ViaCorridor = (receiver.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                        if (!corridorsCompatible(inv1Corridor, rCorridor)) continue;
                        if (!corridorsCompatible(inv2Corridor, rCorridor)) continue;
                        const rCap = Number(receiver.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                        if (receiver.totalVolume + pairVol > rCap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) continue;
                        if (receiver.assignedInvoices.length + 2 > OPTIMIZATION_CONSTANTS.MAX_INVOICES) continue;

                        const distReceiverBefore = routeDist(receiver.assignedInvoices);
                        const pairHasTW =
                            typeof (inv1 as any).timeWindowMinutes === 'number' ||
                            typeof (inv2 as any).timeWindowMinutes === 'number';

                        for (let pos = 0; pos <= receiver.assignedInvoices.length; pos++) {
                            const receiverWith = [
                                ...receiver.assignedInvoices.slice(0, pos),
                                inv1,
                                inv2,
                                ...receiver.assignedInvoices.slice(pos),
                            ];
                            if (estimateRouteTotalMinutes(receiverWith, hubLat, hubLng) >= MAX_ROUTE_MINUTES) continue;
                            if (pairHasTW || receiver.assignedInvoices.some(i => typeof (i as any).timeWindowMinutes === 'number')) {
                                if (routeViolatesTimeWindows(receiverWith, hubLat, hubLng)) continue;
                            }
                            const distReceiverAfter = routeDist(receiverWith);
                            const gain = (distDonorBefore + distReceiverBefore) - (distDonorAfter + distReceiverAfter);
                            if (gain > bestGain) {
                                bestGain = gain;
                                bestRi = ri;
                                bestPos = pos;
                            }
                        }
                    }

                    if (bestRi >= 0) {
                        const receiver = work[bestRi];
                        const rCap = Number(receiver.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                        work[di] = {
                            ...donor,
                            assignedInvoices: donorWithout,
                            totalVolume: Number((donor.totalVolume - pairVol).toFixed(4)),
                            utilization: Math.round(((donor.totalVolume - pairVol) / donorCap) * 100),
                        };
                        work[bestRi] = {
                            ...receiver,
                            assignedInvoices: [
                                ...receiver.assignedInvoices.slice(0, bestPos),
                                inv1,
                                inv2,
                                ...receiver.assignedInvoices.slice(bestPos),
                            ],
                            totalVolume: Number((receiver.totalVolume + pairVol).toFixed(4)),
                            utilization: Math.round(((receiver.totalVolume + pairVol) / rCap) * 100),
                        };
                        improved = true;
                        break outerPair;
                    }
                }
            }
        }

        if (!improved) break;
    }

    return work.filter(r => r.assignedInvoices.length > 0);
}

// ─── ILS — Iterated Local Search con perturbación adaptiva y memoria tabú ────
/**
 * Después de Or-opt, ejecuta N rondas de perturbación + reparación para escapar
 * mínimos locales.
 *
 * Mejoras vs versión anterior:
 * - 12 rondas por defecto (era 4)
 * - Perturbación adaptiva: empieza en 20%, sube 5% cada 2 rondas sin mejora,
 *   cap en 40%. Rutas grandes necesitan más destrucción para salir de mínimos.
 * - Memoria tabú: IDs de facturas recién perturbadas no se vuelven a destruir
 *   en la ronda siguiente, forzando exploración de nuevas regiones del espacio.
 * - LOCAL SEARCH más agresivo en rondas sin mejora (20 rondas de or-opt vs 15).
 */
export function ilsImprove(
    routes: SuggestedRoute[],
    hubLat: number,
    hubLng: number,
    rounds: number = 12
): SuggestedRoute[] {
    if (routes.length < 2) return routes;

    const getLat = (inv: Invoice) => Number((inv as any).lat || hubLat);
    const getLng = (inv: Invoice) => Number((inv as any).lng || hubLng);

    const routeDist = (invs: Invoice[]): number => {
        if (invs.length === 0) return 0;
        let d = haversineKm(hubLat, hubLng, getLat(invs[0]), getLng(invs[0]));
        for (let i = 0; i < invs.length - 1; i++) {
            d += haversineKm(getLat(invs[i]), getLng(invs[i]), getLat(invs[i + 1]), getLng(invs[i + 1]));
        }
        d += haversineKm(getLat(invs[invs.length - 1]), getLng(invs[invs.length - 1]), hubLat, hubLng);
        return d;
    };

    const solutionScore = (rs: SuggestedRoute[]): number => {
        const assigned = rs.reduce((s, r) => s + r.assignedInvoices.length, 0);
        const dist = rs.reduce((s, r) => s + routeDist(r.assignedInvoices), 0);
        return assigned * 100_000 - dist;
    };

    let best = routes.map(r => ({ ...r, assignedInvoices: [...r.assignedInvoices] }));
    let bestScore = solutionScore(best);
    let noImprovementStreak = 0;
    const tabuIds = new Set<string>(); // IDs de facturas tabú (no destruir esta ronda)

    for (let round = 0; round < rounds; round++) {
        // ── DESTROY — perturbación adaptiva ─────────────────────────────────────
        const perturbPct = Math.min(0.40, 0.20 + Math.floor(noImprovementStreak / 2) * 0.05);
        const perturbed = best.map(r => ({ ...r, assignedInvoices: [...r.assignedInvoices] }));
        const removed: Invoice[] = [];
        const removedIds = new Set<string>();

        const nRemove = Math.max(2, Math.ceil(perturbed.length * perturbPct));
        const shuffledIdxs = perturbed
            .map((_, i) => i)
            .sort(() => Math.random() - 0.5)
            .slice(0, nRemove);

        for (const ri of shuffledIdxs) {
            const r = perturbed[ri];
            if (r.assignedInvoices.length === 0) continue;
            // Candidatos que no estén en tabú
            const candidates = r.assignedInvoices
                .map((inv, ki) => ({ inv, ki }))
                .filter(({ inv }) => !tabuIds.has(inv.id));
            if (candidates.length === 0) continue;
            const { inv, ki } = candidates[Math.floor(Math.random() * candidates.length)];
            const invVol = Number(inv.volumeM3) || 0;
            removed.push(inv);
            removedIds.add(inv.id);
            const newInvs = r.assignedInvoices.filter((_, i) => i !== ki);
            const cap = Number(r.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
            perturbed[ri] = {
                ...r,
                assignedInvoices: newInvs,
                totalVolume: Number((r.totalVolume - invVol).toFixed(4)),
                utilization: Math.round(((r.totalVolume - invVol) / cap) * 100),
            };
        }

        // ── REPAIR ──────────────────────────────────────────────────────────────
        for (const inv of removed) {
            const invVol = Number(inv.volumeM3) || 0;
            const invCorridor: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
            const invNeighborhood = String((inv as any).neighborhoodKey || '').toUpperCase().trim();
            let bestRi = -1, bestPos = -1, bestDist = Infinity;

            for (let ri = 0; ri < perturbed.length; ri++) {
                const r = perturbed[ri];
                if (r.assignedInvoices.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) continue;
                const cap = Number(r.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                if (r.totalVolume + invVol > cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) continue;
                // Respetar restricciones de barrio para vehículos grandes
                if (cap > LARGE_VEHICLE_THRESHOLD_M3 && invNeighborhood && RESTRICTED_NEIGHBORHOODS.includes(invNeighborhood)) continue;
                const rCorridor: ViaCorridor = (r.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                if (!corridorsCompatible(invCorridor, rCorridor)) continue;

                for (let pos = 0; pos <= r.assignedInvoices.length; pos++) {
                    const withInv = [...r.assignedInvoices.slice(0, pos), inv, ...r.assignedInvoices.slice(pos)];
                    if (estimateRouteTotalMinutes(withInv, hubLat, hubLng) >= MAX_ROUTE_MINUTES) continue;
                    if (routeViolatesTimeWindows(withInv, hubLat, hubLng)) continue;
                    const d = routeDist(withInv);
                    if (d < bestDist) { bestDist = d; bestRi = ri; bestPos = pos; }
                }
            }

            if (bestRi >= 0) {
                const r = perturbed[bestRi];
                const cap = Number(r.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                const newInvs = [...r.assignedInvoices.slice(0, bestPos), inv, ...r.assignedInvoices.slice(bestPos)];
                perturbed[bestRi] = {
                    ...r,
                    assignedInvoices: newInvs,
                    totalVolume: Number((r.totalVolume + invVol).toFixed(4)),
                    utilization: Math.round(((r.totalVolume + invVol) / cap) * 100),
                };
            }
        }

        // ── LOCAL SEARCH — más agresivo cuando hay racha sin mejora ─────────────
        const repaired = perturbed.filter(r => r.assignedInvoices.length > 0);
        const orOptRounds = noImprovementStreak >= 3 ? 25 : 15;
        const localOpt = orOptInterRoute(repaired, hubLat, hubLng, orOptRounds);

        // ── ACCEPT + tabú update ─────────────────────────────────────────────────
        const newScore = solutionScore(localOpt);
        if (newScore > bestScore) {
            best = localOpt;
            bestScore = newScore;
            noImprovementStreak = 0;
        } else {
            noImprovementStreak++;
        }
        // Rotar tabú: las facturas de esta ronda se prohíben en la siguiente
        tabuIds.clear();
        removedIds.forEach(id => tabuIds.add(id));
    }

    return best;
}
