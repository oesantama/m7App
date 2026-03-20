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

  // 2. PDF417 Ajover: SKU es la parte ANTES del primer ':'
  // Condicion: parte izquierda >= 3 chars Y parte derecha >= 2 chars
  // (evita falsos positivos en codigos cortos como "A:1")
  if (code.includes(':')) {
    const colonIdx = code.indexOf(':');
    const left = code.substring(0, colonIdx);
    const right = code.substring(colonIdx + 1);
    if (left.length >= 3 && right.length >= 2) {
      code = left;
    }
  }

  // 3. GS1-128: eliminar separador de grupo \x1D (ASCII 29) y prefijo "(01)"
  code = code.replace(/\x1D/g, '');
  if (code.startsWith('(01)')) code = code.substring(4);

  // 4. Limpiar caracteres de control remanentes
  // N (sin tilde) = ENTER en teclado ES con layout EN en algunos modelos Android
  code = code.replace(/[Ñ\t\n]/g, '');

  return code.trim();
};
