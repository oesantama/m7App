
process.env.TZ = 'America/Bogota';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/index.js';
import { initDeliveryTables } from './controllers/dispatch.controller.js';
import { initScheduler } from './services/scheduler.service.js';

const app = express();

// Configuración para Proxy (Coolify/Nginx) - Necesario para Rate Limiting
app.set('trust proxy', 1);

// Middlewares de Seguridad Crítica (Hallazgos QA)
app.use(helmet()); // Oculta X-Powered-By y agrega cabeceras de seguridad
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Limitador de Intentos de Login (Hallazgo QA) 15 peticiones por 15 min por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
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

import { authenticateToken } from './middleware/auth.middleware.js';

// Montaje de API Modular
app.use('/api/auth/login', loginLimiter); 

// Endpoint de diagnóstico RAÍZ absoluto (Omitir cualquier middleware de /api)
app.get('/health-sec', (req, res) => {
  const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
  
  res.json({ 
    status: 'UP', 
    version: '1.9.25-ISOLATED-CORES',
    keys_in_pool: keys.length,
    key_lengths: keys.map(k => k.length),
    key_detected: keys.length > 0,
    env: process.env.NODE_ENV
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', version: '1.9.21-STABLE', timestamp: new Date() });
});

// Middleware de Whitelisting y Protección Global (Seguridad Arquitectónica)
app.use('/api', (req, res, next) => {
  const publicPaths = ['/auth/login', '/health', '/', '/geocode', '/public/order-status'];
  
  if (publicPaths.includes(req.path) || req.path.startsWith('/public/order-status')) {
    return next();
  }
  return authenticateToken(req, res, next);
}, apiRoutes);

// Health Check Global para Proxies (Coolify/Nginx)
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Orbit Kernal Operational', version: '1.9.21-STABLE' });
});

// Manejo Seguro de Rutas no Encontradas (Hallazgo QA: Ocultar nginx/express)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Recurso no disponible en el núcleo Orbit",
    code: 404
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`[ORBIT-SYSTEM] Servidor Operacional en Puerto ${PORT}`);
  console.log(`[ORBIT-SYSTEM] Versión: 1.9.21-STABLE`);
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
      // Importación dinámica y ejecución de recuperación nuclear
      return import('./services/migration.service.js');
    })
    .then(async (m) => {
      const dbStart = Date.now();
      console.log('[ORBIT-BOOT] Ejecutando Restauración Nuclear...');
      const result = await m.restoreSystem();
      console.log(`[ORBIT-BOOT] Sistema configurado en ${Date.now() - dbStart}ms:`, result.message);
    })
    .catch((err: any) => {
      console.error('[ORBIT-BOOT] ERROR CRÍTICO EN ARRANQUE:', err.message);
      if (err.stack) console.error(err.stack);
    });
});
