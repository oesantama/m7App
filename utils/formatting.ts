/**
 * Milla 7 - Utilidades de Formateo Global
 * Centraliza el formato de moneda, fechas y números para todo el sistema OrbitM7.
 */

/**
 * Formatea un número como moneda colombiana (COP).
 * @param value Valor numérico o string.
 * @returns String formateado: $ 1.000.000
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '$ 0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$ 0';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(num);
};

/**
 * Formatea una fecha en formato es-CO.
 * @param date Fecha en formato Date, string ISO o timestamp.
 * @param includeTime Si se debe incluir la hora.
 * @returns String formateado.
 */
export const formatDate = (date: Date | string | number | null | undefined, includeTime: boolean = false): string => {
  if (!date) return 'S/I';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'S/I';

  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return d.toLocaleString('es-CO', options).toUpperCase();
};

/**
 * Normaliza strings para comparaciones y búsquedas (remover acentos, lower case).
 */
export const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};
