import { Invoice, Vehicle } from '../types';
import {
  DISPATCH_DEPARTURE_HOUR,
  AVG_MINUTES_PER_STOP,
  LARGE_VEHICLE_THRESHOLD_M3,
  RESTRICTED_NEIGHBORHOODS
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
    MAX_UTILIZATION: 0.92,     // 92% — techo máximo antes de rechazar más facturas
    CRITICAL_THRESHOLD: 0.95,  // 95% — bloqueo crítico de sobrecarga
    WARN_THRESHOLD: 0.90,      // 90% — umbral de advertencia amarilla
    DEFAULT_CAPACITY: 30,      // m³ por defecto si el vehículo no tiene capacidad definida
    OPTIMIZATION_DELAY: 1200   // ms de delay para la animación de optimización
};
