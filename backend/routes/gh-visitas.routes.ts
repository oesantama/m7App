import { Router } from 'express';
import * as ghVisitasController from '../controllers/gh-visitas.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas (sin auth — whitelist en server.ts)
router.get('/public/areas', ghVisitasController.getAreas);
router.post('/public/save', ghVisitasController.saveVisitaPublic);

// Rutas protegidas
router.get('/', requirePermission('VISITAS_GH', 'view'), ghVisitasController.getVisitas);
router.post('/', requirePermission('VISITAS_GH', 'create'), ghVisitasController.saveVisita);
router.patch('/:id/salida', requirePermission('VISITAS_GH', 'edit'), ghVisitasController.marcarSalida);

export default router;
