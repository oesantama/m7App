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

  // 2. Lógica AJOVER: Si contiene ':', el SKU es lo que está antes del PRIMER ':' útil
  // Pero ojo, solo si el ':' no es parte de un prefijo de basura conocido que ya quitamos.
  if (code.includes(':')) {
    // Tomamos la primera parte antes del delimitador de metadatos (formato PDF417 Ajover)
    const parts = code.split(':');
    if (parts[0].length >= 3) {
      code = parts[0];
    }
  }

  // 3. Limpiar caracteres de control remanentes (Basura física o regional)
  // Ñ suele ser un ENTER en teclado ES con input EN.
  // GS1/EAN: Limpieza de prefijo (01) al inicio
  if (code.startsWith('(01)')) code = code.substring(4);
  
  const garbageRegex = /[Ñ\t\n\r]/g;
  code = code.replace(garbageRegex, '');

  return code.trim();
};
