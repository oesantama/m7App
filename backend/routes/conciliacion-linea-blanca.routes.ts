import express from 'express';
import * as ConciliacionLBCtrl from '../controllers/conciliacion-linea-blanca.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', ConciliacionLBCtrl.saveConciliacion);
router.get('/', ConciliacionLBCtrl.getHistorialConciliaciones);
router.get('/:id', ConciliacionLBCtrl.getDetallesConciliacion);

export default router;
