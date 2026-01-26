
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { initWhatsApp } from './services/whatsapp.service.js';

dotenv.config();

const app = express();

// Middlewares Globales
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Middleware de Logs M7
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[M7-LOG] ${new Date().toISOString()} - ${req.method} ${req.url} [${res.statusCode}] - ${duration}ms`);
  });
  next();
});

// Montaje de API Modular
app.use('/api', apiRoutes);

// Health Check Global
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Milla 7 Backend', timestamp: new Date() });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`[M7-SYSTEM] Servidor Operacional en Puerto ${PORT}`);
  console.log(`[M7-SYSTEM] Entorno Módulo Nativo ESM activo`);
  console.log('--------------------------------------------------');
  
  // Inicialización de WhatsApp Bot (Asistente IA)
  initWhatsApp();
});
