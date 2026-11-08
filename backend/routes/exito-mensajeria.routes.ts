/**
 * exito-mensajeria.routes.ts
 * Rutas B2B exclusivas para Grupo Éxito (/api/v1/*) y Rutas Internas (/api/exito-mensajeria/*).
 */

import { Router } from 'express';
import {
  authenticateExitoB2B,
  exitoB2BRateLimiter,
} from '../middleware/exito-api-auth.middleware.js';
import {
  createGuideB2B,
  createPickupB2B,
  cancelGuideB2B,
  getGuideLabelB2B,
  getGuideStatusB2B,
  getDashboardAndMetrics,
  listGuides,
  getGuideDetail,
  renderGuideLabelPdfOnDemand,
  createManualGuideInhouse,
  assignPickupVehicle,
  getWarehouseReceptionData,
  confirmWarehouseReception,
  getSmartDispatchSuggestions,
  createUrbanDeliveryRoute,
  manageUrbanDeliveryRoute,
  renderRemissionPdfOnDemand,
  manualStateChangeInhouse,
  manualResendGuideToExito,
  listSyncQueue,
  retrySyncQueueItem,
  resetCircuitBreaker,
  getDriverTasks,
  completeDriverStorePickup,
  completeDriverDelivery,
  reportDriverNovelty,
  listReturnBatches,
  createReturnBatch,
  getMasterCatalogs,
  saveNodoMaster,
  updateConfigKey,
  initializeDriveFolders,
  simulateSandboxGuideFromExito,
  resetSandboxEnvironment,
  getOpenApiSpecJson,
} from '../controllers/exito-mensajeria.controller.js';

// ── 1. ROUTER B2B EXCLUSIVO PARA GO ÉXITO v2.0 (/api/v1/*) ───────────────────
export const exitoB2BRouter = Router();

exitoB2BRouter.use(exitoB2BRateLimiter);
exitoB2BRouter.use(authenticateExitoB2B);

// 7.1 Creación de guía y generación de rótulo
exitoB2BRouter.post('/guides', createGuideB2B);

// 7.1 Consulta / reimpresión de rótulo
exitoB2BRouter.get('/guides/:guideNumber/label', getGuideLabelB2B);
exitoB2BRouter.post('/guides/label', getGuideLabelB2B);

// 7.2 Solicitud de recogida (COLLECT_GUIDE)
exitoB2BRouter.post('/pickups', createPickupB2B);

// 7.3 Anulación idempotente de guía
exitoB2BRouter.post('/guides/:guideNumber/cancel', cancelGuideB2B);
exitoB2BRouter.post('/guides/cancel', cancelGuideB2B);

// Consulta síncrona de estado, historial y soportes en Google Drive
exitoB2BRouter.get('/guides/:guideNumber', getGuideStatusB2B);

// ── 2. ROUTER INTERNO ORBITM7 (INHOUSE PAG-83, CONDUCTOR PAG-84 Y SANDBOX) ──
export const exitoInternalRouter = Router();

// Dashboard, Observabilidad p50/p95/p99, Circuit Breaker y Google Drive Health
exitoInternalRouter.get('/dashboard', getDashboardAndMetrics);

// Gestión de Guías y Contingencia Manual (Rótulos y Planillas PDF generados On-Demand en RAM)
exitoInternalRouter.get('/guias', listGuides);
exitoInternalRouter.get('/guias/por-numero/:numeroGuia/rotulo.pdf', renderGuideLabelPdfOnDemand);
exitoInternalRouter.get('/guias/:id/rotulo.pdf', renderGuideLabelPdfOnDemand);
exitoInternalRouter.get('/planillas/:codigoDocumento/pdf', renderRemissionPdfOnDemand);
exitoInternalRouter.get('/guias/:id', getGuideDetail);
exitoInternalRouter.post('/guias/manual', createManualGuideInhouse);
exitoInternalRouter.post('/guias/asignar-recogida', assignPickupVehicle);

// Recepción de Almacén (PAG-85 — Selección de Placa/Remisión y Pistoleo/Selección de Paquetes)
exitoInternalRouter.get('/almacen/remisiones-recogida', getWarehouseReceptionData);
exitoInternalRouter.post('/guias/recepcion-bodega', confirmWarehouseReception);

exitoInternalRouter.post('/guias/:id/estado-manual', manualStateChangeInhouse);
exitoInternalRouter.post('/guias/:id/reenviar-exito', manualResendGuideToExito);

// Despacho Inteligente y Rutas Urbanas (PAG-86 — Agrupación Inteligente por Barrios/Volumen)
exitoInternalRouter.get('/despacho/sugerencias-inteligentes', getSmartDispatchSuggestions);
exitoInternalRouter.post('/rutas', createUrbanDeliveryRoute);
exitoInternalRouter.put('/rutas/:id/gestionar', manageUrbanDeliveryRoute);

// Cola de Tracking y DLQ (24h) + Circuit Breaker
exitoInternalRouter.get('/cola', listSyncQueue);
exitoInternalRouter.post('/cola/:queueId/reintentar', retrySyncQueueItem);
exitoInternalRouter.post('/circuit-breaker/reset', resetCircuitBreaker);

// Flujo Guiado para Conductor Adulto Mayor (PAG-84)
exitoInternalRouter.get('/conductor/tareas', getDriverTasks);
exitoInternalRouter.post('/conductor/recogida-tienda', completeDriverStorePickup);
exitoInternalRouter.post('/conductor/guias/:id/entregar', completeDriverDelivery);
exitoInternalRouter.post('/conductor/guias/:id/novedad', reportDriverNovelty);

// Devoluciones Semanales a Nodos Éxito
exitoInternalRouter.get('/devoluciones', listReturnBatches);
exitoInternalRouter.post('/devoluciones', createReturnBatch);

// Maestras, Configuración, Inicialización de Google Drive, Sandbox y OpenAPI 3.0.3
exitoInternalRouter.get('/maestras', getMasterCatalogs);
exitoInternalRouter.post('/maestras/nodos', saveNodoMaster);
exitoInternalRouter.post('/configuracion', updateConfigKey);
exitoInternalRouter.post('/drive/init-folders', initializeDriveFolders);
exitoInternalRouter.post('/sandbox/simular-guias', simulateSandboxGuideFromExito);
exitoInternalRouter.post('/sandbox/reset', resetSandboxEnvironment);
exitoInternalRouter.get('/openapi.json', getOpenApiSpecJson);

export default exitoInternalRouter;

