/**
 * Identificación del entorno en lo que sale hacia personas reales (WhatsApp, correo).
 *
 * Pruebas (devsm7.m7apps.com) comparte la instancia de WhatsApp y el correo con producción, y puede tener
 * una copia de los datos reales. Todo mensaje enviado desde pruebas lleva una marca visible para que
 * nadie lo confunda con una notificación real.
 */
export const esPruebas = (): boolean =>
  String(process.env.APP_ENV || '').toLowerCase() === 'develop' || process.env.NODE_ENV === 'staging';

const MARCA_WA = '🧪 *[PRUEBAS]* ';
const MARCA_CORREO = '[PRUEBAS] ';

/** Antepone la marca de pruebas a un texto de WhatsApp (una sola vez). */
export const marcarWhatsApp = (texto?: string): string | undefined => {
  if (!esPruebas() || texto === undefined || texto === null) return texto;
  return texto.startsWith(MARCA_WA) ? texto : MARCA_WA + texto;
};

/** Antepone la marca de pruebas al asunto de un correo (una sola vez). */
export const marcarAsunto = (asunto: string): string => {
  if (!esPruebas()) return asunto;
  return asunto.startsWith(MARCA_CORREO) ? asunto : MARCA_CORREO + asunto;
};
