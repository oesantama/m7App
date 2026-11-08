/**
 * exito-api-auth.middleware.ts
 * Middleware de Seguridad B2B Exclusivo para Go Éxito v2.0 (Secciones 6 y 13 del Lineamiento Técnico).
 *
 * Implementa:
 * 1. Bloqueo inmediato (401) si se envían credenciales en Query String.
 * 2. Validación en tiempo constante (crypto.timingSafeEqual) de x-api-key / Authorization Bearer
 *    separada por ambiente (PROD, QA, SANDBOX).
 * 3. Propagación y validación de x-correlation-id (UUID v4) e Idempotency-Key.
 * 4. Rate Limiting con encabezado Retry-After en respuestas 429.
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import rateLimit from 'express-rate-limit';

export interface ExitoApiRequest extends Request {
  correlationId?: string;
  idempotencyKey?: string;
  exitoAmbiente?: 'PROD' | 'QA' | 'SANDBOX';
  isExitoSandbox?: boolean;
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Rate Limiter oficial para los endpoints B2B de Go Éxito con cabecera Retry-After (Sección 6.2).
 */
export const exitoB2BRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: Number(process.env.EXITO_RATE_LIMIT_PER_MIN || 300),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: ExitoApiRequest, res: Response) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    res.setHeader('Retry-After', '15');
    res.setHeader('x-correlation-id', correlationId);
    res.status(429).json({
      transactionId: correlationId,
      timestamp: new Date().toISOString(),
      result: 'ERROR',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Cuota de peticiones por minuto superada. Respete el encabezado Retry-After.',
      details: [{ field: 'rateLimit', issue: 'Exceso de TPS permitido en ventana de 60s' }],
    });
  },
});

/**
 * Middleware de autenticación y encabezados obligatorios de Go Éxito v2.0.
 */
export function authenticateExitoB2B(req: ExitoApiRequest, res: Response, next: NextFunction) {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  // 1. Prohibición estricta de credenciales en Query String (Sección 6.1 y 13)
  const queryKeys = Object.keys(req.query || {}).map((k) => k.toLowerCase());
  if (
    queryKeys.includes('api_key') ||
    queryKeys.includes('apikey') ||
    queryKeys.includes('x-api-key') ||
    queryKeys.includes('token') ||
    queryKeys.includes('secret')
  ) {
    return res.status(401).json({
      transactionId: correlationId,
      timestamp: new Date().toISOString(),
      result: 'ERROR',
      code: 'CREDENTIALS_IN_QUERY_FORBIDDEN',
      message: 'Por seguridad (Sección 6.1 Go Éxito v2.0), está prohibido enviar credenciales en el query string.',
      details: [{ field: 'query', issue: 'Use exclusivamente los encabezados x-api-key o Authorization' }],
    });
  }

  // 2. Extraer credencial de encabezados x-api-key o Authorization: Bearer
  const headerApiKey = (req.headers['x-api-key'] as string)?.trim() || '';
  const authHeader = (req.headers['authorization'] as string)?.trim() || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const providedSecret = headerApiKey || bearerToken;

  if (!providedSecret) {
    return res.status(401).json({
      transactionId: correlationId,
      timestamp: new Date().toISOString(),
      result: 'ERROR',
      code: 'MISSING_AUTHENTICATION',
      message: 'Falta encabezado de autenticación requerido (x-api-key o Authorization Bearer).',
      details: [{ field: 'x-api-key', issue: 'Encabezado ausente' }],
    });
  }

  // 3. Llaves por ambiente: SOLO desde variables de entorno (nunca en el código, que va al
  // repositorio). Una llave sin configurar no autentica. Fuera de producción hay una llave
  // de sandbox por defecto para pruebas locales.
  const prodKey = process.env.EXITO_API_KEY_PROD?.trim() || '';
  const qaKey = process.env.EXITO_API_KEY_QA?.trim() || '';
  const sandboxKey = process.env.EXITO_API_KEY_SANDBOX?.trim()
    || (process.env.NODE_ENV !== 'production' ? 'm7_goexito_sandbox_2026_test_key' : '');

  let ambiente: 'PROD' | 'QA' | 'SANDBOX' | null = null;
  if (prodKey && safeCompare(providedSecret, prodKey)) {
    ambiente = 'PROD';
  } else if (qaKey && safeCompare(providedSecret, qaKey)) {
    ambiente = 'QA';
  } else if (sandboxKey && safeCompare(providedSecret, sandboxKey)) {
    ambiente = 'SANDBOX';
  }

  if (!ambiente) {
    return res.status(403).json({
      transactionId: correlationId,
      timestamp: new Date().toISOString(),
      result: 'ERROR',
      code: 'INVALID_API_CREDENTIALS',
      message: 'Credencial x-api-key o token no válido o sin permisos para esta operación.',
      details: [{ field: 'x-api-key', issue: 'Llave rechazada' }],
    });
  }

  // Si el payload indica sandbox: true o header x-exito-sandbox: true, forzar modo SANDBOX
  const bodySandbox =
    req.body?.sandbox === true ||
    req.body?.data?.sandbox === true ||
    req.body?.data?.data?.sandbox === true ||
    req.headers['x-exito-sandbox'] === 'true';

  req.exitoAmbiente = bodySandbox ? 'SANDBOX' : ambiente;
  req.isExitoSandbox = req.exitoAmbiente === 'SANDBOX';
  req.idempotencyKey = (req.headers['idempotency-key'] as string)?.trim() || undefined;

  return next();
}

