/**
 * M7 Smart SKU Cleansing Utility
 *
 * Limpia codigos de barras eliminando basura de hardware y metadatos (lotes, fechas, etc.)
 * para extraer siempre el SKU real mas significativo.
 *
 * Formatos soportados:
 *  - PDF417 Ajover (lectora A): D403199:BL:1:A010236539  → D403199
 *  - PDF417 Ajover (lectora B): D403199ÑBLÑ1ÑA010236539  → D403199  (Ñ en lugar de :)
 *  - GS1-128:         (01)07898357... / \x1D prefijos
 *  - Hardware prefix: S4:D403199, ID:D403199, SKU:D403199
 *  - 1D barcodes:     codigo limpio sin separadores
 */

/** Detecta el separador de campo del código de barras (: o Ñ) */
export const detectBarcodeSep = (raw: string): ':' | 'Ñ' | null => {
  const up = raw.toUpperCase();
  if (up.includes('Ñ')) return 'Ñ';
  if (up.includes(':')) return ':';
  return null;
};

/**
 * Extrae la cantidad embebida en el código de barras (campo después del tipo, antes del lote).
 * Formato: SKU<sep>TIPO<sep>CANTIDAD<sep>LOTE<sep>...
 * Retorna 1 si no se detecta cantidad válida.
 */
export const extractQtyFromBarcode = (raw: string): number => {
  const sep = detectBarcodeSep(raw);
  if (!sep) return 1;
  const parts = raw.toUpperCase().split(sep).map(p => p.trim());
  // Buscar primer campo numérico ≤4 dígitos después del primero (que es el SKU)
  const found = parts.slice(1).find(p => p.length > 0 && p.length <= 4 && /^\d+$/.test(p));
  return found ? Number(found) : 1;
};

export const cleanSkuM7 = (raw: string): string => {
  if (!raw) return '';

  // Normalizar: trim, mayusculas, quitar \r (Windows line endings de algunos scanners)
  let code = raw.trim().toUpperCase().replace(/\r/g, '');

  // 1. Eliminar prefijos de hardware conocidos al inicio
  const knownPrefixes = ['S4:', 'ID:', 'SKU:'];
  for (const prefix of knownPrefixes) {
    if (code.startsWith(prefix)) {
      code = code.substring(prefix.length);
      break;
    }
  }

  // 2. PDF417 Ajover / Composite Barcodes: SKU es la parte ANTES del primer separador (':' o 'Ñ')
  // Condicion: parte izquierda >= 3 chars para evitar falsos positivos
  const separatorMatch = code.match(/[:Ñ]/);
  if (separatorMatch) {
    const idx = separatorMatch.index!;
    const left = code.substring(0, idx);
    const right = code.substring(idx + 1);
    if (left.length >= 3) {
      code = left;
    }
  }

  // 3. GS1-128: eliminar separador de grupo \x1D (ASCII 29) y prefijo "(01)"
  code = code.replace(/\x1D/g, '');
  if (code.startsWith('(01)')) code = code.substring(4);

  // 4. Limpiar caracteres de control remanentes
  code = code.replace(/[\t\n]/g, '');

  // 5. Eliminar separadores al final
  code = code.replace(/[:Ñ]+$/, '');

  return code.trim();
};
