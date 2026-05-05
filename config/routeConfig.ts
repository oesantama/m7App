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

/** Minutos promedio por parada (tránsito + servicio) — se ajusta por zona de congestión */
export const AVG_MINUTES_PER_STOP = 25;

/** Jornada máxima de trabajo en minutos (8 horas) */
export const MAX_ROUTE_MINUTES = 8 * 60; // 480 min

// ─────────────────────────────────────────────────────────────────────────────
// MACRO-REGIONES — primera capa de separación
// Facturas de macro-regiones distintas NUNCA van en la misma ruta.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ciudades del Oriente Antioqueño.
 * Se accede por Túnel de Oriente (~25 min fijo) o Vía Las Palmas (~35 min).
 * Son geográficamente separadas del Valle de Aburrá — ruta propia siempre.
 */
export const ORIENTE_ANTIOQUEÑO_CITIES = new Set([
  'RIONEGRO', 'MARINILLA', 'EL CARMEN DE VIBORAL', 'EL CARMEN',
  'GUARNE', 'LA CEJA', 'EL RETIRO', 'EL SANTUARIO', 'LA UNION',
  'COCORNA', 'SAN VICENTE', 'GRANADA', 'SONSÓN', 'SONSON',
  'ABEJORRAL', 'ARGELIA', 'NARIÑO', 'ALEJANDRIA',
]);

/**
 * Ciudades del Occidente Antioqueño.
 * Se accede por Autopista al Mar (Túnel de Occidente).
 * Ruta propia, nunca mezclar con Valle de Aburrá.
 */
export const OCCIDENTE_ANTIOQUEÑO_CITIES = new Set([
  'SANTA FE DE ANTIOQUIA', 'SANTA FE', 'SOPETRAN', 'SOPETRÁN',
  'SAN JERONIMO', 'SAN JERÓNIMO', 'OLAYA', 'LIBORINA',
  'EBEJICO', 'HELICONIA', 'ARMENIA MANTEQUILLA',
]);

// ─────────────────────────────────────────────────────────────────────────────
// CORREDORES VIALES — segunda capa dentro del Valle de Aburrá
// Un corredor = conjunto de municipios conectados por la misma vía principal.
// Facturas de corredores distintos solo se mezclan si el volumen es muy bajo.
// ─────────────────────────────────────────────────────────────────────────────

export type ViaCorridor =
  | 'NORTE'          // Autopista Norte: Bello, Copacabana, Girardota, Barbosa
  | 'NORTE_LEJANO'   // Más allá de Girardota
  | 'MED_OCC'        // Medellín Occidente: Laureles, Belén, San Javier, Robledo, Castilla
  | 'MED_CENTRO'     // Medellín Centro: La Candelaria, Alpujarra, Buenos Aires
  | 'MED_ORI'        // Medellín Oriente: Poblado, Aranjuez, Manrique, Villa Hermosa
  | 'ENVIGADO'       // Envigado (puede fusionarse con SUR o MED_ORI según volumen)
  | 'SUR'            // Autopista Sur: Itagüí, Sabaneta, La Estrella
  | 'SUR_LEJANO'     // Caldas, más allá de La Estrella
  | 'ORIENTE_ANT'    // Macro-región Oriente Antioqueño (siempre separado)
  | 'OCCIDENTE_ANT'; // Macro-región Occidente Antioqueño (siempre separado)

/** Ciudades/municipios → corredor. Los municipios del Valle de Aburrá no en esta lista
 *  se clasifican por coordenadas GPS.
 */
export const CITY_TO_CORRIDOR: Record<string, ViaCorridor> = {
  // Norte
  'BELLO': 'NORTE',
  'COPACABANA': 'NORTE',
  'GIRARDOTA': 'NORTE_LEJANO',
  'BARBOSA': 'NORTE_LEJANO',
  'DON MATIAS': 'NORTE_LEJANO',
  'DON MATÍAS': 'NORTE_LEJANO',
  // Sur
  'ITAGUI': 'SUR',
  'ITAGÜÍ': 'SUR',
  'SABANETA': 'SUR',
  'LA ESTRELLA': 'SUR',
  'CALDAS': 'SUR_LEJANO',
  // Envigado — puede ir con SUR o MED_ORI; se maneja como propio
  'ENVIGADO': 'ENVIGADO',
  // Oriente Antioqueño
  'RIONEGRO': 'ORIENTE_ANT',
  'MARINILLA': 'ORIENTE_ANT',
  'EL CARMEN DE VIBORAL': 'ORIENTE_ANT',
  'EL CARMEN': 'ORIENTE_ANT',
  'GUARNE': 'ORIENTE_ANT',
  'LA CEJA': 'ORIENTE_ANT',
  'EL RETIRO': 'ORIENTE_ANT',
  'EL SANTUARIO': 'ORIENTE_ANT',
  'LA UNION': 'ORIENTE_ANT',
  'LA UNIÓN': 'ORIENTE_ANT',
  'COCORNA': 'ORIENTE_ANT',
  'COCORNÁ': 'ORIENTE_ANT',
  'SAN VICENTE': 'ORIENTE_ANT',
  'GRANADA': 'ORIENTE_ANT',
  'SONSON': 'ORIENTE_ANT',
  'SONSÓN': 'ORIENTE_ANT',
  // Occidente Antioqueño
  'SANTA FE DE ANTIOQUIA': 'OCCIDENTE_ANT',
  'SOPETRAN': 'OCCIDENTE_ANT',
  'SOPETRÁN': 'OCCIDENTE_ANT',
  'SAN JERONIMO': 'OCCIDENTE_ANT',
  'SAN JERÓNIMO': 'OCCIDENTE_ANT',
  'HELICONIA': 'OCCIDENTE_ANT',
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN DE NOMBRES DE CIUDAD
// Mapea códigos DANE, abreviaciones y variantes al nombre canónico esperado
// por CITY_TO_CORRIDOR. Si el nombre ya es canónico, la función lo devuelve igual.
// ─────────────────────────────────────────────────────────────────────────────
const CITY_NAME_MAP: Record<string, string> = {
  // Códigos DANE Antioquia
  '05001': 'MEDELLÍN', '5001': 'MEDELLÍN',
  '05088': 'BELLO',    '5088': 'BELLO',
  '05360': 'ITAGÜÍ',   '5360': 'ITAGÜÍ',
  '05631': 'SABANETA', '5631': 'SABANETA',
  '05129': 'CALDAS',   '5129': 'CALDAS',
  '05212': 'LA ESTRELLA', '5212': 'LA ESTRELLA',
  '05266': 'ENVIGADO', '5266': 'ENVIGADO',
  '05308': 'GIRARDOTA','5308': 'GIRARDOTA',
  '05197': 'COPACABANA','5197': 'COPACABANA',
  '05045': 'BARBOSA',  '5045': 'BARBOSA',
  '05615': 'RIONEGRO', '5615': 'RIONEGRO',
  '05310': 'GUARNE',   '5310': 'GUARNE',
  '05353': 'ITAGÜÍ',   '5353': 'ITAGÜÍ',
  '05380': 'LA CEJA',  '5380': 'LA CEJA',
  '05400': 'MARINILLA','5400': 'MARINILLA',
  '05756': 'EL RETIRO','5756': 'EL RETIRO',
  '05697': 'SAN VICENTE','5697': 'SAN VICENTE',
  // Abreviaciones y variantes comunes
  'MEDELLIN': 'MEDELLÍN', 'MEDELL': 'MEDELLÍN', 'MED': 'MEDELLÍN',
  'ITAGUI': 'ITAGÜÍ', 'ITAG': 'ITAGÜÍ',
  'SABANETA': 'SABANETA', 'SAB': 'SABANETA',
  'LA ESTRELLA': 'LA ESTRELLA', 'ESTRELLA': 'LA ESTRELLA', 'L ESTRELLA': 'LA ESTRELLA',
  'ENVIGADO': 'ENVIGADO', 'ENV': 'ENVIGADO',
  'BELLO': 'BELLO',
  'COPACABANA': 'COPACABANA', 'COPA': 'COPACABANA',
  'GIRARDOTA': 'GIRARDOTA',
  'BARBOSA': 'BARBOSA',
  'CALDAS': 'CALDAS',
  'RIONEGRO': 'RIONEGRO', 'RIO NEGRO': 'RIONEGRO',
  'MARINILLA': 'MARINILLA',
  'GUARNE': 'GUARNE',
  'LA CEJA': 'LA CEJA',
  'EL RETIRO': 'EL RETIRO',
  'SANTA FE DE ANTIOQUIA': 'SANTA FE DE ANTIOQUIA', 'SANTA FE': 'SANTA FE DE ANTIOQUIA',
  'SOPETRAN': 'SOPETRÁN', 'SOPETRÁN': 'SOPETRÁN',
  'DON MATIAS': 'DON MATÍAS', 'DON MATÍAS': 'DON MATÍAS',
  'LA UNION': 'LA UNIÓN', 'LA UNIÓN': 'LA UNIÓN',
  'SONSON': 'SONSÓN', 'SONSÓN': 'SONSÓN',
  'EL CARMEN': 'EL CARMEN DE VIBORAL', 'EL CARMEN DE VIBORAL': 'EL CARMEN DE VIBORAL',
};

/** Convierte cualquier representación de ciudad (código DANE, abreviación, variante)
 *  al nombre canónico que usa CITY_TO_CORRIDOR. */
export function normalizeCityName(raw: string): string {
  const upper = raw.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  // Chequear el mapa (sin tildes para la clave de búsqueda)
  for (const [key, canonical] of Object.entries(CITY_NAME_MAP)) {
    const keyNorm = key.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (upper === keyNorm) return canonical;
  }
  // Si no hay mapeo, devolver el original en mayúsculas (puede ya ser canónico)
  return raw.trim().toUpperCase();
}

/**
 * Corredores que pueden fusionarse cuando el volumen individual es bajo.
 * Un corredor A puede mezclarse con B si B está en la lista de adyacentes de A.
 * ORIENTE_ANT y OCCIDENTE_ANT NUNCA tienen adyacentes (son macro-regiones duras).
 */
/**
 * Solo corredores físicamente contiguos por la misma vía principal.
 * NORTE ↔ MED_OCC (Autopista Norte → Castilla/Robledo)
 * MED_OCC ↔ MED_CENTRO (Laureles/Belén → Centro)
 * MED_CENTRO ↔ MED_ORI / SUR (Centro conecta ambos lados)
 * MED_ORI ↔ ENVIGADO (Poblado → Envigado)
 * ENVIGADO ↔ SUR (Envigado → Sabaneta/Itagüí)
 * Se eliminó NORTE↔MED_CENTRO, NORTE↔MED_ORI, MED_OCC↔SUR
 * para evitar rutas que mezclen zonas físicamente lejanas.
 * Cuando un corredor tiene pocas facturas, el sweep relaxes estas restricciones
 * por proximidad geográfica pura (ver sweep-fallback en RoutePlanner).
 */
export const CORRIDOR_ADJACENT: Record<ViaCorridor, ViaCorridor[]> = {
  'NORTE_LEJANO':  ['NORTE'],
  'NORTE':         ['NORTE_LEJANO', 'MED_OCC'],
  'MED_OCC':       ['NORTE', 'MED_CENTRO'],
  'MED_CENTRO':    ['MED_OCC', 'MED_ORI', 'SUR'],
  'MED_ORI':       ['MED_CENTRO', 'ENVIGADO'],
  'ENVIGADO':      ['MED_ORI', 'SUR'],
  'SUR':           ['MED_CENTRO', 'ENVIGADO', 'SUR_LEJANO'],
  'SUR_LEJANO':    ['SUR'],
  'ORIENTE_ANT':   [],
  'OCCIDENTE_ANT': [],
};

/** Orden de prioridad de corredores para el sort global (norte→sur, luego oriente) */
export const CORRIDOR_ORDER: ViaCorridor[] = [
  'NORTE_LEJANO', 'NORTE',
  'MED_OCC', 'MED_CENTRO', 'MED_ORI',
  'ENVIGADO', 'SUR', 'SUR_LEJANO',
  'ORIENTE_ANT', 'OCCIDENTE_ANT',
];

// ─────────────────────────────────────────────────────────────────────────────
// ZONAS DE CONGESTIÓN — multiplicadores de tiempo por zona
// Se aplican durante estimación de duración de ruta.
// Pico AM: 7-9 AM  |  Pico PM: 5-7 PM
// ─────────────────────────────────────────────────────────────────────────────

export interface CongestionZone {
  name: string;
  multiplierPeak: number;    // factor de tiempo en hora pico (ej. 1.6 = 60% más lento)
  multiplierOffPeak: number; // factor fuera de pico
  /** Bbox aproximado: [minLat, maxLat, minLng, maxLng] */
  bbox: [number, number, number, number];
}

export const CONGESTION_ZONES: CongestionZone[] = [
  {
    name: 'CENTRO_MEDELLIN',
    multiplierPeak: 1.65,
    multiplierOffPeak: 1.20,
    bbox: [6.235, 6.275, -75.580, -75.550],
  },
  {
    name: 'AUTOPISTA_NORTE_PICO',
    multiplierPeak: 1.40,
    multiplierOffPeak: 1.10,
    bbox: [6.275, 6.370, -75.600, -75.540],
  },
  {
    name: 'AUTOPISTA_SUR_PICO',
    multiplierPeak: 1.45,
    multiplierOffPeak: 1.10,
    bbox: [6.130, 6.220, -75.620, -75.570],
  },
  {
    name: 'ITAGUI_INDUSTRIAL',
    multiplierPeak: 1.35,
    multiplierOffPeak: 1.10,
    bbox: [6.160, 6.200, -75.640, -75.600],
  },
  {
    name: 'TUNEL_ORIENTE_ACCESO',
    multiplierPeak: 1.50,
    multiplierOffPeak: 1.15,
    bbox: [6.200, 6.260, -75.540, -75.490],
  },
];

/** Tiempo fijo adicional (min) por cruzar el Túnel de Oriente (ida) */
export const TUNEL_ORIENTE_FIXED_MIN = 30;
