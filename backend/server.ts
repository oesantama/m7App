
process.env.TZ = 'America/Bogota';
import dotenv from 'dotenv';
dotenv.config();

import cluster from 'cluster';
import os from 'os';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';
import ghVisitasRoutes from './routes/gh-visitas.routes.js';
import authRoutes from './routes/auth.routes.js';
import { initDeliveryTables } from './controllers/dispatch.controller.js';
import { initScheduler } from './services/scheduler.service.js';
import { authenticateToken } from './middleware/auth.middleware.js';
import fs from 'fs';

// ── CLUSTER: if primary in production, fork 2 workers and stop here ──────────
if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  const numCPUs = Math.min(os.cpus().length, 2);
  console.log(`[ORBIT-CLUSTER] Primary ${process.pid} — forking ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.warn(`[ORBIT-CLUSTER] Worker ${worker.process.pid} died (code ${code}) — restarting`);
    cluster.fork();
  });
  // Primary process stops here — workers run the Express app below
} else {

// Leer versión desde package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
const APP_VERSION = pkg.version || '1.0.0';

const app = express();

// Configuración para Proxy (Coolify/Nginx) - Necesario para Rate Limiting
app.set('trust proxy', 1);

// Middlewares de Seguridad Crítica (Hallazgos QA)
app.use(helmet({
  contentSecurityPolicy: false, // Permitir iframes y scripts en el manual si es necesario
}));

// CORS restrictivo: solo dominios conocidos en producción
const allowedOrigins = [
  'https://orbitm7.m7apps.com',
  'https://www.orbitm7.m7apps.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir siempre localhost y requests sin origin para desarrollo/testing
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    // En producción, validar contra la whitelist
    if (process.env.NODE_ENV === 'production') {
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: Origen no permitido — ${origin}`));
    }
    // En otros entornos permitimos todo
    callback(null, true);
  },
  credentials: true,
}));

// Limit request body a 50MB (para permitir carga de PDFs escaneados)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request-ID middleware: cada request lleva un ID único para trazabilidad en logs
app.use((req: any, _res, next) => {
  req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
  next();
});

// Servir archivos estáticos públicos (Manual Técnico, logos, etc.)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Servir la carpeta public desde la raíz del proyecto
app.use(express.static(path.join(projectRoot, 'public')));

// Limitador de Intentos de Login — solo estricto en producción
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 15 : 1000,
  message: { error: 'Demasiados intentos de acceso desde esta IP. Intente en 15 minutos.' }
});

// Middleware de Logs M7
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[ORBIT-LOG] ${new Date().toISOString()} - ${req.method} ${req.url} [${res.statusCode}] - ${duration}ms`);
  });
  next();
});

// Montaje de API Modular
app.use('/api/auth/login', loginLimiter); 

// REMOVIDO: /health-sec exponía claves API sin autenticación — ver audit Sprint 1

// Estado de arranque: false hasta que migraciones terminen
let systemReady = false;

app.get('/health', (req, res) => {
  res.json({ status: 'UP', ready: systemReady, version: APP_VERSION, timestamp: new Date() });
});

// /ready: usado por Docker healthcheck — retorna 503 mientras migración no termine
app.get('/ready', (req, res) => {
  if (systemReady) {
    res.json({ status: 'READY', message: 'Sistema completamente operacional' });
  } else {
    res.status(503).json({ status: 'STARTING', message: 'Sistema iniciando, migraciones en progreso...' });
  }
});

// Middleware de Whitelisting y Protección Global (Seguridad Arquitectónica)
app.use('/api', (req, res, next) => {
  const publicPaths = [
    '/auth/login', 
    '/health', 
    '/', 
    '/geocode', 
    '/grupo-inter/public/list',
    '/training/public/attendance',
    '/training/public/session',
    '/gh-personal/public/survey/validate',
    '/gh-personal/public/survey/save',
    '/cfg-ciudades/departamentos',
    '/cfg-ciudades/ciudades',
    '/gh-miscelaneos',
    '/gh-visitas/public'
  ];
  
  if (publicPaths.some(p => p === '/' ? req.path === '/' : req.path.startsWith(p))) {
    return next();
  }
  return authenticateToken(req, res, next);
}, apiRoutes);

// Health Check Global para Proxies (Coolify/Nginx)
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Orbit Kernal Operational', version: APP_VERSION });
});

// Manejo Seguro de Rutas no Encontradas (Hallazgo QA: Ocultar nginx/express)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Recurso no disponible en el núcleo Orbit",
    code: 404
  });
});

// Handler global de errores Express — nunca exponer stack al cliente
app.use((err: any, req: any, res: any, _next: any) => {
  const reqId = req.requestId || 'no-id';
  console.error(`[ORBIT-ERROR] [${reqId}] ${req.method} ${req.url} — ${err.message}`);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : err.message,
    code: err.status || 500
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`[ORBIT-SYSTEM] Servidor Operacional en Puerto ${PORT}`);
  console.log(`[ORBIT-SYSTEM] Versión: ${APP_VERSION}`);
  console.log(`[ORBIT-SYSTEM] Entorno Módulo Nativo ESM activo`);
  console.log('--------------------------------------------------');
  initScheduler();

  // Inicialización de WhatsApp 
  console.log('[ORBIT-SYSTEM] Evolution API Integration Active');

  // FLUJO DE ARRANQUE CRÍTICO M7 (SECUENCIAL PARA EVITAR DEADLOCKS)
  console.log('[ORBIT-BOOT] Iniciando secuencia de servicios...');
  
  initDeliveryTables()
    .then(() => {
      console.log('[ORBIT-BOOT] Tablas de Despacho verificadas.');
      return import('./services/migration.service.js');
    })
    .then(async (m) => {
      const dbStart = Date.now();
      console.log('[ORBIT-BOOT] Ejecutando Restauración Nuclear...');
      const result = await m.restoreSystem();
      console.log(`[ORBIT-BOOT] Sistema configurado en ${Date.now() - dbStart}ms:`, result.message);
      
      // Lanzar optimizaciones pesadas en segundo plano para no bloquear el 200 OK del healthcheck
      m.runBackgroundOptimizations().catch(() => {});

      // Marcar sistema como listo — el healthcheck de Docker ahora responderá OK
      systemReady = true;
      console.log('[ORBIT-BOOT] ✓ Sistema LISTO para recibir tráfico.');
    })
    .catch((err: any) => {
      console.error('[ORBIT-BOOT] ERROR CRÍTICO EN ARRANQUE:', err.message);
      if (err.stack) console.error(err.stack);
      // Marcar como listo igual para no bloquear indefinidamente en caso de error no crítico
      systemReady = true;
    });
});

// Handlers globales de Node — evitan crash silencioso en promesas no capturadas
process.on('unhandledRejection', (reason: any) => {
  console.error('[ORBIT-UNHANDLED-REJECTION]', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('[ORBIT-UNCAUGHT-EXCEPTION] Proceso en estado inestable, reiniciando:', err.message);
  process.exit(1); // Docker/PM2 reiniciará el contenedor limpiamente
});

// Cierre del bloque else del cluster (ver inicio de archivo)
}
