/**
 * M7 Smart SKU Cleansing Utility
 * 
 * Limpia los códigos de barras de la "basura" de hardware y metadatos (Lotes, Fechas, etc)
 * buscando siempre el SKU real más significativo.
 */

export const cleanSkuM7 = (raw: string): string => {
  if (!raw) return '';

  let code = raw.trim().toUpperCase().replace(/'/g, '-');

  // 1. Eliminar prefijos de hardware conocidos
  const knownPrefixes = ['S4:', 'ID:', 'SKU:'];
  for (const prefix of knownPrefixes) {
    if (code.startsWith(prefix)) {
      code = code.substring(prefix.length);
    }
  }

  // 2. Identificar delimitadores comunes de metadatos
  // Ñ es común en teclados configurados como ES pero con hardware EN
  const delimiters = [':', 'Ñ', '|', '+', '#', ';'];
  
  for (const delimiter of delimiters) {
    if (code.includes(delimiter)) {
      // Tomamos solo la primera parte
      code = code.split(delimiter)[0];
    }
  }

  // 3. Limpieza final de espacios o caracteres no deseados en los extremos
  return code.trim();
};
