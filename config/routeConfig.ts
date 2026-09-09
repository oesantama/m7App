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
// Catálogo oficial completo de los 125 municipios de Antioquia (código DANE → nombre),
// tomado de la fuente oficial DANE/DIVIPOLA (datos.gov.co, dataset gdxc-w37w). Se guarda
// cada código en su forma con cero a la izquierda ("05001") y sin él ("5001"), porque
// así llega indistintamente desde los archivos de Plan R / Plan Normal.
// Nota: el mapeo anterior (hecho a mano) tenía varios códigos DANE incorrectos —
// ej. mapeaba 05045/05212/05353/05697/05756 a ciudades equivocadas — quedaron corregidos acá.
const DANE_ANTIOQUIA: [string, string][] = [
  ['05001', 'MEDELLÍN'], ['05002', 'ABEJORRAL'], ['05004', 'ABRIAQUÍ'], ['05021', 'ALEJANDRÍA'],
  ['05030', 'AMAGÁ'], ['05031', 'AMALFI'], ['05034', 'ANDES'], ['05036', 'ANGELÓPOLIS'],
  ['05038', 'ANGOSTURA'], ['05040', 'ANORÍ'], ['05042', 'SANTA FE DE ANTIOQUIA'], ['05044', 'ANZÁ'],
  ['05045', 'APARTADÓ'], ['05051', 'ARBOLETES'], ['05055', 'ARGELIA'], ['05059', 'ARMENIA'],
  ['05079', 'BARBOSA'], ['05086', 'BELMIRA'], ['05088', 'BELLO'], ['05091', 'BETANIA'],
  ['05093', 'BETULIA'], ['05101', 'CIUDAD BOLÍVAR'], ['05107', 'BRICEÑO'], ['05113', 'BURITICÁ'],
  ['05120', 'CÁCERES'], ['05125', 'CAICEDO'], ['05129', 'CALDAS'], ['05134', 'CAMPAMENTO'],
  ['05138', 'CAÑASGORDAS'], ['05142', 'CARACOLÍ'], ['05145', 'CARAMANTA'], ['05147', 'CAREPA'],
  ['05148', 'EL CARMEN DE VIBORAL'], ['05150', 'CAROLINA'], ['05154', 'CAUCASIA'], ['05172', 'CHIGORODÓ'],
  ['05190', 'CISNEROS'], ['05197', 'COCORNÁ'], ['05206', 'CONCEPCIÓN'], ['05209', 'CONCORDIA'],
  ['05212', 'COPACABANA'], ['05234', 'DABEIBA'], ['05237', 'DON MATÍAS'], ['05240', 'EBÉJICO'],
  ['05250', 'EL BAGRE'], ['05264', 'ENTRERRÍOS'], ['05266', 'ENVIGADO'], ['05282', 'FREDONIA'],
  ['05284', 'FRONTINO'], ['05306', 'GIRALDO'], ['05308', 'GIRARDOTA'], ['05310', 'GÓMEZ PLATA'],
  ['05313', 'GRANADA'], ['05315', 'GUADALUPE'], ['05318', 'GUARNE'], ['05321', 'GUATAPÉ'],
  ['05347', 'HELICONIA'], ['05353', 'HISPANIA'], ['05360', 'ITAGÜÍ'], ['05361', 'ITUANGO'],
  ['05364', 'JARDÍN'], ['05368', 'JERICÓ'], ['05376', 'LA CEJA'], ['05380', 'LA ESTRELLA'],
  ['05390', 'LA PINTADA'], ['05400', 'LA UNIÓN'], ['05411', 'LIBORINA'], ['05425', 'MACEO'],
  ['05440', 'MARINILLA'], ['05467', 'MONTEBELLO'], ['05475', 'MURINDÓ'], ['05480', 'MUTATÁ'],
  ['05483', 'NARIÑO'], ['05490', 'NECOCLÍ'], ['05495', 'NECHÍ'], ['05501', 'OLAYA'],
  ['05541', 'PEÑOL'], ['05543', 'PEQUE'], ['05576', 'PUEBLORRICO'], ['05579', 'PUERTO BERRÍO'],
  ['05585', 'PUERTO NARE'], ['05591', 'PUERTO TRIUNFO'], ['05604', 'REMEDIOS'], ['05607', 'EL RETIRO'],
  ['05615', 'RIONEGRO'], ['05628', 'SABANALARGA'], ['05631', 'SABANETA'], ['05642', 'SALGAR'],
  ['05647', 'SAN ANDRÉS DE CUERQUÍA'], ['05649', 'SAN CARLOS'], ['05652', 'SAN FRANCISCO'], ['05656', 'SAN JERÓNIMO'],
  ['05658', 'SAN JOSÉ DE LA MONTAÑA'], ['05659', 'SAN JUAN DE URABÁ'], ['05660', 'SAN LUIS'], ['05664', 'SAN PEDRO DE LOS MILAGROS'],
  ['05665', 'SAN PEDRO DE URABÁ'], ['05667', 'SAN RAFAEL'], ['05670', 'SAN ROQUE'], ['05674', 'SAN VICENTE FERRER'],
  ['05679', 'SANTA BÁRBARA'], ['05686', 'SANTA ROSA DE OSOS'], ['05690', 'SANTO DOMINGO'], ['05697', 'EL SANTUARIO'],
  ['05736', 'SEGOVIA'], ['05756', 'SONSÓN'], ['05761', 'SOPETRÁN'], ['05789', 'TÁMESIS'],
  ['05790', 'TARAZÁ'], ['05792', 'TARSO'], ['05809', 'TITIRIBÍ'], ['05819', 'TOLEDO'],
  ['05837', 'TURBO'], ['05842', 'URAMITA'], ['05847', 'URRAO'], ['05854', 'VALDIVIA'],
  ['05856', 'VALPARAÍSO'], ['05858', 'VEGACHÍ'], ['05861', 'VENECIA'], ['05873', 'VIGÍA DEL FUERTE'],
  ['05885', 'YALÍ'], ['05887', 'YARUMAL'], ['05890', 'YOLOMBÓ'], ['05893', 'YONDÓ'],
  ['05895', 'ZARAGOZA'],
];

const CITY_NAME_MAP: Record<string, string> = {
  ...Object.fromEntries(DANE_ANTIOQUIA.flatMap(([code, name]) => [[code, name], [String(Number(code)), name]])),
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
