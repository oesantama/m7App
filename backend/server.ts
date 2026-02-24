
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/index.js';

dotenv.config();

const app = express();

// Configuración para Proxy (Coolify/Nginx) - Necesario para Rate Limiting
app.set('trust proxy', 1);

// Middlewares de Seguridad Crítica (Hallazgos QA)
app.use(helmet()); // Oculta X-Powered-By y agrega cabeceras de seguridad
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// Montaje de API Modular
app.use('/api/auth/login', loginLimiter); // Aplicar límite solo al login primero
app.use('/api', apiRoutes);

// Health Check Global
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Orbit Logistics Backend', timestamp: new Date() });
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
  console.log(`[ORBIT-SYSTEM] Versión: 1.0.4 - BK-FORCE-RELOAD`);
  console.log(`[ORBIT-SYSTEM] Entorno Módulo Nativo ESM activo`);
  console.log('--------------------------------------------------');

  // Inicialización de WhatsApp 
  console.log('[ORBIT-SYSTEM] Evolution API Integration Active');

  // RESTAURACIÓN AUTOMÁTICA M7 (MIGRACIONES)
  import('./services/migration.service.js').then(m => {
    m.restoreSystem()
      .then(r => console.log('[ORBIT-AUTO] Sistema configurado:', r.message))
      .catch(e => console.error('[ORBIT-AUTO] Fallo en configuración inicial:', e.message));
  });
});
