/**
 * Configuración Operacional de Rutas — ORBIT M7
 * Editar este archivo para cambiar restricciones sin modificar la lógica del algoritmo.
 */

/** Coordenadas del hub de despacho (bodega origen) */
export const ORBIT_HUB_ORIGIN = {
  lat: 6.110595,
  lng: -75.641505,
  address: "CR 48C N°100 Sur - 72 Bodega 4 y 10, La Tablaza"
};

/**
 * Barrios con restricciones de acceso para vehículos grandes.
 * Se aplica cuando capacidad del vehículo supera LARGE_VEHICLE_THRESHOLD_M3.
 */
export const RESTRICTED_NEIGHBORHOODS: string[] = [
  'COMUNA 13',
  'SAN JAVIER',
  'SANTO DOMINGO',
  'POPULAR',
  'SANTA CRUZ',
  'MANRIQUE',
  'ARANJUEZ'
];

/** Umbral de capacidad (m³) a partir del cual se aplican restricciones de barrio */
export const LARGE_VEHICLE_THRESHOLD_M3 = 15;

/**
 * Palabras clave que identifican cadenas de almacenes.
 * Estas reciben una ruta dedicada si su volumen supera RETAIL_CHAIN_MIN_VOLUME_M3.
 */
export const RETAIL_CHAIN_KEYWORDS: string[] = [
  'JUMBO', 'EXITO', 'TOROS', 'MAKRO', 'ALKOSTO'
];

/** Volumen mínimo (m³) de facturas de cadena para justificar ruta dedicada */
export const RETAIL_CHAIN_MIN_VOLUME_M3 = 8;

/** Hora de salida del hub en formato 24h (8 = 8:00 AM) */
export const DISPATCH_DEPARTURE_HOUR = 8;

/** Minutos promedio por parada (tránsito + servicio) para estimación de tiempos */
export const AVG_MINUTES_PER_STOP = 25;
