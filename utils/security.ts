/**
 * Utilidades de Seguridad Base para OrbitM7
 * Previene:
 *  - CSV / Excel Formula Injection (CWE-1236)
 *  - Carga de archivos sobredimensionados o con extensiones falsificadas
 *  - Denial of Service / Memory Exhaustion vía JSON anidado
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitiza valores de texto para neutralizar inyecciones de fórmulas de Excel / CSV.
 * Si un valor inicia con '=', '+', '-', '@' o tabulaciones, se antepone un apóstrofe (')
 * para forzar que el cliente ofimático lo interprete como texto plano y no ejecute comandos DDE.
 */
export function sanitizeFormulaInjection(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length > 0 && FORMULA_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
    // Si ya tiene un apóstrofe inicial, no duplicar
    if (trimmed.startsWith("'")) return value;
    return `'${value}`;
  }
  return value;
}

/**
 * Sanitiza un objeto de fila completo neutralizando fórmulas en cada celda.
 */
export function sanitizeRowObject<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const sanitized: any = Array.isArray(row) ? [] : {};
  for (const [key, val] of Object.entries(row)) {
    // Protección contra Prototype Pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      sanitized[key] = sanitizeRowObject(val);
    } else {
      sanitized[key] = sanitizeFormulaInjection(val);
    }
  }
  return sanitized;
}

/**
 * Valida un archivo antes de procesarlo en memoria:
 * - Valida tamaño máximo permitido (por defecto 25MB).
 * - Valida extensión contra la lista blanca permitida.
 */
export function validateImportFile(
  file: File,
  allowedExtensions: string[] = ['.xlsx', '.xls', '.csv', '.json'],
  maxSizeBytes: number = 25 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo.' };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'El archivo está vacío (0 bytes).' };
  }

  if (file.size > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `El archivo supera el tamaño máximo permitido de ${maxMb} MB.` };
  }

  const fileName = file.name.toLowerCase();
  const hasValidExt = allowedExtensions.some(ext => fileName.endsWith(ext.toLowerCase()));
  if (!hasValidExt) {
    return {
      valid: false,
      error: `Formato no permitido. Solo se aceptan extensiones: ${allowedExtensions.join(', ')}.`
    };
  }

  return { valid: true };
}

/**
 * Parser seguro de JSON con limitación de profundidad para mitigar DoS por recursión.
 */
export function safeJsonParse(jsonString: string, maxDepth: number = 10): any {
  if (typeof jsonString !== 'string' || !jsonString.trim()) return null;
  const parsed = JSON.parse(jsonString);

  function checkDepth(obj: any, currentDepth: number): void {
    if (currentDepth > maxDepth) {
      throw new Error(`La estructura JSON supera la profundidad máxima permitida (${maxDepth}).`);
    }
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          delete obj[key];
          continue;
        }
        checkDepth(obj[key], currentDepth + 1);
      }
    }
  }

  checkDepth(parsed, 1);
  return parsed;
}
