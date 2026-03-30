/**
 * M7 Address Analyzer Service
 * Analiza direcciones colombianas, detecta problemas y sugiere correcciones.
 */

export interface AddressIssue {
  itemIndex: number;
  originalAddress: string;
  originalCity: string;
  issueType: 'incomplete' | 'ambiguous' | 'invalid' | 'missing_number' | 'missing_city';
  description: string;
  suggestion: string;
  confidence: number; // 0-1
}

export interface AddressAnalysisResult {
  totalItems: number;
  issuesFound: number;
  issues: AddressIssue[];
  processingTimeMs: number;
  summary: {
    incomplete: number;
    ambiguous: number;
    invalid: number;
    missing_number: number;
    missing_city: number;
  };
}

// Patrones colombianos de vías
const VIA_PATTERNS = [
  /^(calle|cl|cll)\s*\d+/i,
  /^(carrera|cra|kr|cra\.)\s*\d+/i,
  /^(avenida|av|avda?)\s+/i,
  /^(diagonal|diag|dg)\s*\d+/i,
  /^(transversal|tv|transv)\s*\d+/i,
  /^(circular|circ)\s*\d+/i,
];

const NUMERO_PATTERNS = [
  /#\s*\d+/,       // #23
  /\d+\s*-\s*\d+/, // 23-45
  /no\.?\s*\d+/i,  // No. 23
];

const CIUDADES_COLOMBIA = new Set([
  'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla',
  'cartagena', 'bucaramanga', 'cucuta', 'cúcuta', 'pereira', 'manizales',
  'ibague', 'ibagué', 'santa marta', 'villavicencio', 'monteria', 'montería',
  'pasto', 'armenia', 'neiva', 'soledad', 'soacha', 'bello', 'itagui',
  'itagüí', 'buenaventura', 'palmira', 'valledupar', 'popayan', 'popayán',
  'sincelejo', 'floridablanca', 'dosquebradas', 'envigado', 'barrancabermeja',
  'girardot', 'tuluá', 'tulua', 'riohacha', 'quibdo', 'quibdó', 'tunja',
  'yopal', 'mocoa', 'inirida', 'san jose del guaviare', 'mitú', 'mitu',
  'leticia', 'puerto carreño', 'puerto carreno'
]);

const ABREVIACIONES_MAP: Record<string, string> = {
  'cl': 'Calle',
  'cll': 'Calle',
  'cra': 'Carrera',
  'kr': 'Carrera',
  'av': 'Avenida',
  'avda': 'Avenida',
  'dg': 'Diagonal',
  'diag': 'Diagonal',
  'tv': 'Transversal',
  'transv': 'Transversal',
  'circ': 'Circular',
};

function normalizeStr(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function expandAbreviaciones(address: string): string {
  let result = address.trim();
  for (const [abbr, full] of Object.entries(ABREVIACIONES_MAP)) {
    const regex = new RegExp(`^${abbr}\\.?\\s+`, 'i');
    if (regex.test(result)) {
      result = result.replace(regex, `${full} `);
      break;
    }
  }
  return result;
}

function isValidVia(address: string): boolean {
  return VIA_PATTERNS.some(p => p.test(address.trim()));
}

function hasNumero(address: string): boolean {
  return NUMERO_PATTERNS.some(p => p.test(address));
}

function isValidCity(city: string): boolean {
  if (!city || city === 'S/D' || city === 'S/I' || city.length < 3) return false;
  return CIUDADES_COLOMBIA.has(normalizeStr(city));
}

function analyzeAddress(
  address: string,
  city: string,
  index: number
): AddressIssue | null {
  const addr = (address || '').trim();
  const cty = (city || '').trim();

  // Sin ciudad o ciudad genérica
  if (!cty || cty === 'S/D' || cty === 'S/I') {
    return {
      itemIndex: index,
      originalAddress: addr,
      originalCity: cty,
      issueType: 'missing_city',
      description: 'Ciudad de destino no especificada',
      suggestion: addr,
      confidence: 0.95,
    };
  }

  // Ciudad no reconocida como municipio colombiano
  if (!isValidCity(cty)) {
    return {
      itemIndex: index,
      originalAddress: addr,
      originalCity: cty,
      issueType: 'ambiguous',
      description: `Ciudad "${cty}" no reconocida como municipio colombiano`,
      suggestion: addr,
      confidence: 0.7,
    };
  }

  // Dirección vacía
  if (!addr || addr === 'S/D' || addr === 'S/I' || addr.length < 5) {
    return {
      itemIndex: index,
      originalAddress: addr,
      originalCity: cty,
      issueType: 'invalid',
      description: 'Dirección de entrega vacía o inválida',
      suggestion: `${expandAbreviaciones(addr)} — verificar en ${cty}`,
      confidence: 0.99,
    };
  }

  // No tiene número (# o guión)
  if (!hasNumero(addr)) {
    const expanded = expandAbreviaciones(addr);
    return {
      itemIndex: index,
      originalAddress: addr,
      originalCity: cty,
      issueType: 'missing_number',
      description: 'Dirección sin número de puerta o complemento (#)',
      suggestion: `${expanded} #__ — completar número`,
      confidence: 0.85,
    };
  }

  // Tipo de vía no reconocido
  if (!isValidVia(addr)) {
    const expanded = expandAbreviaciones(addr);
    return {
      itemIndex: index,
      originalAddress: addr,
      originalCity: cty,
      issueType: 'incomplete',
      description: 'Tipo de vía no estándar (Calle/Carrera/Avenida no detectado)',
      suggestion: expanded !== addr ? expanded : addr,
      confidence: 0.6,
    };
  }

  return null; // Dirección OK
}

export function analyzeAddresses(
  items: Array<{ address?: string; city?: string; [key: string]: any }>
): AddressAnalysisResult {
  const start = Date.now();
  const issues: AddressIssue[] = [];

  const summary = {
    incomplete: 0,
    ambiguous: 0,
    invalid: 0,
    missing_number: 0,
    missing_city: 0,
  };

  items.forEach((item, idx) => {
    const issue = analyzeAddress(item.address || '', item.city || '', idx);
    if (issue) {
      issues.push(issue);
      summary[issue.issueType] = (summary[issue.issueType] || 0) + 1;
    }
  });

  return {
    totalItems: items.length,
    issuesFound: issues.length,
    issues,
    processingTimeMs: Date.now() - start,
    summary,
  };
}
