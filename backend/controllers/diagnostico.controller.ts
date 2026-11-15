import { Request, Response } from 'express';
import pool from '../config/database.js';
import { sendEmail } from '../services/notification.service.js';

/**
 * Diagnóstico del servidor (solo SuperAdmin): GET /api/system/diagnostico
 *
 * Revisa en un solo llamado lo que debe funcionar en un servidor recién desplegado o migrado:
 * BD y migraciones, correo, WhatsApp (Evolution), IA (Ollama y Gemini), integración Éxito y
 * variables de entorno clave. Nunca devuelve secretos: solo si están configurados.
 *
 * POST /api/system/diagnostico/correo-prueba { to } envía un correo real de prueba.
 */

type Check = { ok: boolean; detalle: string; [k: string]: any };

const conTimeout = async (url: string, init: RequestInit = {}, ms = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

const definida = (v?: string) => Boolean(v && v.trim() !== '');

async function checkBaseDatos(): Promise<Check> {
  try {
    const r = await pool.query(`
      SELECT current_database() AS bd,
             (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')::int AS tablas,
             (SELECT count(*) FROM _schema_migrations)::int AS migraciones,
             (SELECT max(id) FROM _schema_migrations) AS ultima_migracion,
             (SELECT count(*) FROM users)::int AS usuarios,
             pg_size_pretty(pg_database_size(current_database())) AS tamano
    `);
    const d = r.rows[0];
    // Producción completa tiene ~250 tablas; una BD creada solo con migraciones queda en ~100.
    const ok = d.tablas >= 240;
    return {
      ok,
      detalle: ok ? 'Esquema completo' : `Esquema incompleto (${d.tablas} tablas): restaurar desde respaldo de producción`,
      ...d,
    };
  } catch (e: any) {
    return { ok: false, detalle: `Sin conexión a la BD: ${e.message}` };
  }
}

function checkCorreo(): Check {
  const habilitado = process.env.EMAIL_ENABLED === 'true';
  const resend = definida(process.env.RESEND_API_KEY);
  const smtp = definida(process.env.EMAIL_HOST) && definida(process.env.EMAIL_USER) && definida(process.env.EMAIL_PASSWORD);
  const ok = habilitado && (resend || smtp);
  return {
    ok,
    detalle: !habilitado
      ? 'EMAIL_ENABLED no es "true": no se envía ningún correo (recuperación de contraseña, novedades, Éxito)'
      : ok ? `Envío por ${resend ? 'Resend' : 'SMTP'}${resend && smtp ? ' con respaldo SMTP' : ''}` : 'Habilitado pero sin RESEND_API_KEY ni credenciales SMTP',
    habilitado,
    resend,
    smtp,
    remitente: process.env.EMAIL_FROM || null,
    smtp_alertas_hv: definida(process.env.SMTP_HOST),
  };
}

async function checkEvolution(): Promise<Check> {
  const url = process.env.EVOLUTION_API_URL || 'http://evolution:8080';
  if (!definida(process.env.EVOLUTION_API_KEY)) {
    return { ok: false, detalle: 'EVOLUTION_API_KEY no definida (se usaría la clave por defecto del código)', url };
  }
  try {
    const r = await conTimeout(`${url}/instance/fetchInstances`, { headers: { apikey: process.env.EVOLUTION_API_KEY! } });
    if (!r.ok) return { ok: false, detalle: `Evolution respondió ${r.status}`, url };
    const data: any = await r.json().catch(() => []);
    const instancias = (Array.isArray(data) ? data : []).map((i: any) => ({
      nombre: i?.name || i?.instance?.instanceName,
      estado: i?.connectionStatus || i?.instance?.status || i?.state,
    }));
    const conectadas = instancias.filter(i => String(i.estado).toLowerCase() === 'open').length;
    return {
      ok: conectadas > 0,
      detalle: conectadas > 0 ? `${conectadas} instancia(s) de WhatsApp conectadas` : 'Evolution responde pero ninguna instancia está conectada (escanear QR)',
      url,
      instancias,
    };
  } catch (e: any) {
    return { ok: false, detalle: `Evolution no responde: ${e.name === 'AbortError' ? 'tiempo agotado' : e.message}`, url };
  }
}

async function checkOllama(): Promise<Check> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  let requeridos: string[] = ['llama3:8b', 'qwen2.5-coder:7b'];
  try {
    const r = await pool.query(`SELECT id FROM ai_models WHERE provider_id = 'ollama' AND status = 'active'`);
    if (r.rows.length) requeridos = r.rows.map(x => x.id);
  } catch { /* tabla del orquestador aún no creada: se usan los modelos por defecto */ }

  try {
    const r = await conTimeout(`${host}/api/tags`);
    if (!r.ok) return { ok: false, detalle: `Ollama respondió ${r.status}`, host };
    const data: any = await r.json();
    const instalados: string[] = (data?.models || []).map((m: any) => m.name);
    const faltan = requeridos.filter(m => !instalados.includes(m) && !instalados.includes(`${m}:latest`));
    return {
      ok: faltan.length === 0,
      detalle: faltan.length ? `Faltan modelos: ${faltan.join(', ')} (ollama pull ...)` : 'Ollama en línea con todos los modelos configurados',
      host,
      instalados,
      requeridos,
    };
  } catch (e: any) {
    return {
      ok: false,
      detalle: `Ollama no responde en ${host}: ${e.name === 'AbortError' ? 'tiempo agotado' : e.message}. ` +
        (host.includes('localhost') ? 'Dentro de un contenedor "localhost" no es el servidor: defina OLLAMA_HOST.' : ''),
      host,
      requeridos,
    };
  }
}

async function checkPruebaOllama(): Promise<Check> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const inicio = Date.now();
  try {
    const r = await conTimeout(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3:8b', prompt: 'Responde solo: OK', stream: false, options: { num_predict: 5 } }),
    }, 120000);
    const data: any = await r.json().catch(() => ({}));
    return { ok: r.ok && Boolean(data?.response), detalle: r.ok ? `Respuesta: "${String(data?.response || '').trim()}"` : `HTTP ${r.status}`, ms: Date.now() - inicio };
  } catch (e: any) {
    return { ok: false, detalle: e.message, ms: Date.now() - inicio };
  }
}

function checkGemini(): Check {
  const claves = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').split(',').filter(k => k.trim()).length;
  return { ok: claves > 0, detalle: claves ? `${claves} clave(s) Gemini configuradas` : 'Sin GEMINI_API_KEY', claves };
}

function checkEntorno(): Check {
  const appEnv = String(process.env.APP_ENV || '').toUpperCase();
  const esPruebas = appEnv === 'DEVELOP';
  const exitoDestino = esPruebas || process.env.NODE_ENV === 'staging' ? 'QA de Éxito' : 'PRODUCCIÓN de Éxito';
  const avisos: string[] = [];
  if (!definida(process.env.APP_URL)) avisos.push('APP_URL no definida: algunos enlaces de correos usan la URL por defecto');
  if (!definida(process.env.APP_ENV)) avisos.push('APP_ENV no definida');
  if (esPruebas && process.env.DISABLE_CRON !== 'true') avisos.push('Pruebas con cron activo: puede enviar mensajes reales si la BD es copia de producción');
  if (!esPruebas && process.env.DISABLE_CRON === 'true') avisos.push('Producción con DISABLE_CRON=true: no correrán sincronizaciones ni alertas');
  if (process.env.MAINTENANCE_MODE === 'true') avisos.push('MAINTENANCE_MODE activo: la API responde 503');
  return {
    ok: avisos.length === 0,
    detalle: avisos.length ? avisos.join(' | ') : 'Variables de entorno coherentes',
    NODE_ENV: process.env.NODE_ENV || null,
    APP_ENV: process.env.APP_ENV || null,
    APP_URL: process.env.APP_URL || null,
    DISABLE_CRON: process.env.DISABLE_CRON === 'true',
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE === 'true',
    webhook_exito_destino: exitoDestino,
    jwt_llaves: definida(process.env.JWT_PRIVATE_KEY) ? 'por variable JWT_PRIVATE_KEY' : 'por archivo (volumen m7_keys; si falta se generan nuevas y todos deben volver a iniciar sesión)',
  };
}

export const getDiagnostico = async (req: Request, res: Response) => {
  const probarIA = req.query.probar_ia === '1';
  const [baseDatos, evolution, ollama, pruebaIA] = await Promise.all([
    checkBaseDatos(),
    checkEvolution(),
    checkOllama(),
    probarIA ? checkPruebaOllama() : Promise.resolve(undefined),
  ]);
  const checks: Record<string, Check | undefined> = {
    baseDatos,
    correo: checkCorreo(),
    whatsapp: evolution,
    ollama,
    ollama_generacion: pruebaIA,
    gemini: checkGemini(),
    entorno: checkEntorno(),
  };
  const fallidos = Object.entries(checks).filter(([, c]) => c && !c.ok).map(([k]) => k);
  res.json({
    success: true,
    servidor: req.headers.host,
    fecha: new Date().toISOString(),
    todo_ok: fallidos.length === 0,
    fallidos,
    checks,
  });
};

export const enviarCorreoPrueba = async (req: Request, res: Response) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ success: false, error: 'Indique un correo válido en "to".' });
  }
  try {
    const r = await sendEmail(
      to,
      `✅ Prueba de correo OrbitM7 (${req.headers.host})`,
      `<p>Correo de prueba enviado desde <strong>${req.headers.host}</strong> el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}.</p>
       <p>Si lo recibió, el envío de correos (recuperación de contraseña, novedades, notificaciones) funciona en este servidor.</p>`
    );
    if (!r?.success) return res.status(503).json({ success: false, error: 'EMAIL_ENABLED no es "true": el envío está desactivado.' });
    res.json({ success: true, messageId: r.messageId });
  } catch (e: any) {
    res.status(502).json({ success: false, error: `Falló el envío: ${e.message}` });
  }
};
