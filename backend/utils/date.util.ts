// Utilidades globales de fecha y hora para Zona Horaria Oficial de Colombia (America/Bogota, UTC-5).
// Evita que `new Date().toISOString()` adelante 5 horas (UTC) o cambie al día siguiente después de las 7:00 PM.

/**
 * Formatea columnas DATE (ej. "2026-09-07", sin hora ni zona horaria) a DD/MM/AAAA.
 * Nunca pasar este tipo de valor por `new Date(str)`: se interpreta como medianoche UTC y,
 * al formatear en Bogotá (UTC-5), retrocede un día — por eso se formatea directo del string.
 */
export function formatDateCO(value: string | null | undefined): string {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

/**
 * Devuelve la fecha actual (o de un Date dado) en formato YYYY-MM-DD en hora de Colombia (America/Bogota).
 * Incluso si son las 11:30 PM en Colombia (04:30 AM UTC del día siguiente), devuelve el día correcto de Colombia.
 */
export function todayColombiaStr(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
}

/**
 * Devuelve fecha y hora en formato 'YYYY-MM-DD HH:mm:ss' en hora de Colombia (America/Bogota, 24h).
 * Ideal para rótulos PDF, planillas, remisiones y logs legibles.
 */
export function nowColombiaDateTimeStr(date: Date = new Date()): string {
  const dStr = date.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
  const tStr = date.toLocaleTimeString('en-GB', {
    timeZone: 'America/Bogota',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dStr} ${tStr}`;
}

/**
 * Devuelve un timestamp ISO 8601 estricto con el offset de Colombia (-05:00):
 * Ejemplo: '2026-11-05T08:23:15-05:00'
 * Cumple RFC 3339 / ISO 8601 (Go Éxito v2.0) y conserva la fecha/hora colombiana al hacer .slice(0, 10) o .slice(0, 19).
 */
export function nowColombiaISO(date: Date = new Date()): string {
  const dt = nowColombiaDateTimeStr(date);
  return `${dt.replace(' ', 'T')}-05:00`;
}

/**
 * Extrae año ('YYYY') y mes ('MM') en zona horaria de Colombia para estructuración de carpetas en Google Drive.
 */
export function getColombiaYearMonth(date: Date = new Date()): { year: string; month: string; day: string } {
  const [year, month, day] = todayColombiaStr(date).split('-');
  return { year, month, day };
}

