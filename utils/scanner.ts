/**
 * M7 Smart SKU Cleansing Utility
 * 
 * Limpia los códigos de barras de la "basura" de hardware y metadatos (Lotes, Fechas, etc)
 * buscando siempre el SKU real más significativo.
 */

export const cleanSkuM7 = (raw: string): string => {
  if (!raw) return '';

  let code = raw.trim().toUpperCase();

  // 1. Eliminar prefijos de hardware conocidos (siempre al inicio)
  const knownPrefixes = ['S4:', 'ID:', 'SKU:'];
  for (const prefix of knownPrefixes) {
    if (code.startsWith(prefix)) {
      code = code.substring(prefix.length);
    }
  }

  // 2. Limpiar sufijos basura comunes generados por lectores mal configurados
  // Ñ suele ser un ENTER en teclado ES con input EN.
  // : suele ser TAB o delimitador final.
  // GS1/EAN: Limpieza de prefijo (01) al inicio
  if (code.startsWith('(01)')) code = code.substring(4);
  
  // M7 FAST SCAN: Solo cortamos desde el PRIMER caracter de basura detectado al FINAL de la cadena útil
  const garbageRegex = /[:Ñ\t\n\r].*$/;
  code = code.replace(garbageRegex, '');

  // 3. Limpieza final de espacios o caracteres no deseados en los extremos
  // IMPORTANTE: Ya no dividimos por '+' o '-' o '|' indiscriminadamente
  // porque podrían ser parte del SKU real.
  return code.trim();
};
