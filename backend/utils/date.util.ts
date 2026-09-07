// Formatea columnas DATE (ej. "2026-09-07", sin hora ni zona horaria) a DD/MM/AAAA.
// Nunca pasar este tipo de valor por `new Date(str)`: se interpreta como medianoche UTC y,
// al formatear en Bogotá (UTC-5), retrocede un día — por eso se formatea directo del string.
export function formatDateCO(value: string | null | undefined): string {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}
