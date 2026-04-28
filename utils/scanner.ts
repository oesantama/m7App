/**
 * M7 Smart SKU Cleansing Utility
 *
 * Limpia codigos de barras eliminando basura de hardware y metadatos (lotes, fechas, etc.)
 * para extraer siempre el SKU real mas significativo.
 *
 * Formatos soportados:
 *  - PDF417 Ajover:   D403199:BL:1:A010236539  → D403199
 *  - GS1-128:         (01)07898357... / \x1D prefijos
 *  - Hardware prefix: S4:D403199, ID:D403199, SKU:D403199
 *  - 1D barcodes:     codigo limpio sin separadores
 */
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
