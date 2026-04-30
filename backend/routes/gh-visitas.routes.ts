import { Router } from 'express';
import * as ghVisitasController from '../controllers/gh-visitas.controller.js';

const router = Router();

// Rutas públicas (sin auth — whitelist en server.ts)
router.get('/public/areas', ghVisitasController.getAreas);
router.post('/public/save', ghVisitasController.saveVisitaPublic);

// Rutas protegidas
router.get('/', ghVisitasController.getVisitas);
router.post('/', ghVisitasController.saveVisita);
router.patch('/:id/salida', ghVisitasController.marcarSalida);

export default router;
