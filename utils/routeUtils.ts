import { Invoice, Vehicle } from '../types';

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
    const capacity = vehicleCapacity > 0 ? vehicleCapacity : 30; // Fallback
    return Math.round((loadVolume / capacity) * 100);
}

/**
 * Normaliza ciudad para comparación
 */
export function normalizeCityKey(city: string): string {
    return (city || 'SIN_CIUDAD').toUpperCase().trim();
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
 * Verifica si la carga excede la capacidad del vehículo
 * @returns 'critical' si excede 95%, 'warning' si excede 90%, 'ok' si está bien
 */
export function checkCapacityStatus(loadVolume: number, vehicleCapacity: number): 'critical' | 'warning' | 'ok' {
    const capacity = vehicleCapacity > 0 ? vehicleCapacity : 30;
    const utilization = (loadVolume / capacity) * 100;
    
    if (utilization > 95) return 'critical';
    if (utilization > 90) return 'warning';
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
export  function calculateFleetDeficit(
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
 * Constantes de optimización M7
 */
export const OPTIMIZATION_CONSTANTS = {
    TARGET_UTILIZATION: 0.90,  // 90% objetivo
    MAX_UTILIZATION: 0.90,      // 90% máximo
    CRITICAL_THRESHOLD: 0.95,   // 95% crítico
    DEFAULT_CAPACITY: 30,       // Capacidad por defecto en m3
    OPTIMIZATION_DELAY: 1200    // ms de delay para la animación
};
