import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/gh-activos.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Soportes de eventos: hasta 6 archivos de 10 MB (el controlador valida tipo real y límite por tipo)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 6 } });
const uploadLimiter = rateLimit({ windowMs: 5 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

// Tipos de activo: CRUD en Gestión Humana → Misceláneos (tabla gh_activos_tipos)
router.get('/catalogos', requirePermission('ACTIVOS_GH', 'view'), ctrl.getCatalogos);
router.get('/dashboard', requirePermission('ACTIVOS_GH', 'view'), ctrl.getDashboard);
router.get('/archivos/:archivoId', requirePermission('ACTIVOS_GH', 'view'), ctrl.getArchivo);
router.get('/', requirePermission('ACTIVOS_GH', 'view'), ctrl.listActivos);
router.get('/:id', requirePermission('ACTIVOS_GH', 'view'), ctrl.getActivo);
router.post('/', requirePermission('ACTIVOS_GH', 'create'), ctrl.createActivo);
router.put('/:id', requirePermission('ACTIVOS_GH', 'edit'), ctrl.updateActivo);
router.delete('/:id', requirePermission('ACTIVOS_GH', 'delete'), ctrl.deleteActivo);
router.post('/:id/eventos', requirePermission('ACTIVOS_GH', 'create'), uploadLimiter, upload.array('archivos', 6), ctrl.createEvento);

export default router;
