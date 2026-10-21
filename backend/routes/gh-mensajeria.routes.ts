import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/gh-mensajeria.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Firma (PNG) + foto por acción; el controlador valida tipo real y tamaño (firma ≤ 512 KB, foto ≤ 5 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 2 } });
const evidencias = upload.fields([{ name: 'firma', maxCount: 1 }, { name: 'foto', maxCount: 1 }]);
const uploadLimiter = rateLimit({ windowMs: 5 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

const ADMIN = 'MENSAJERIA_GH';
const MENSAJERO = 'MENSAJERIA_MENSAJERO';

// Panel administrativo
router.get('/mensajeros', requirePermission(ADMIN, 'view'), ctrl.getMensajeros);
router.get('/dashboard', requirePermission(ADMIN, 'view'), ctrl.getDashboard);
router.get('/alertas', requirePermission(ADMIN, 'view'), ctrl.getAlertas);
router.get('/envios', requirePermission(ADMIN, 'view'), ctrl.listEnvios);
router.get('/envios/:id', requirePermission(ADMIN, 'view'), ctrl.getEnvio);
router.post('/envios', requirePermission(ADMIN, 'create'), ctrl.createEnvio);
router.post('/envios/:id/estado', requirePermission(ADMIN, 'edit'), ctrl.cambiarEstadoAdmin);

// Mensajero (solo sus envíos asignados; la propiedad se valida en el controlador)
router.get('/mis-envios', requirePermission(MENSAJERO, 'view'), ctrl.getMisEnvios);
router.get('/mis-envios/:id', requirePermission(MENSAJERO, 'view'), ctrl.getMiEnvio);
router.post('/mis-envios/:id/recoger', requirePermission(MENSAJERO, 'edit'), uploadLimiter, evidencias, ctrl.accionMensajero('recoger'));
router.post('/mis-envios/:id/entregar', requirePermission(MENSAJERO, 'edit'), uploadLimiter, evidencias, ctrl.accionMensajero('entregar'));
router.post('/mis-envios/:id/incidencia', requirePermission(MENSAJERO, 'edit'), uploadLimiter, evidencias, ctrl.accionMensajero('incidencia'));

// Archivos: admin o mensajero asignado (se verifica en el controlador)
router.get('/archivos/:archivoId', requirePermission([ADMIN, MENSAJERO], 'view'), ctrl.getArchivo);

export default router;
