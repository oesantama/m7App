import { Router } from 'express';
import * as ghVisitasController from '../controllers/gh-visitas.controller.js';

const router = Router();

router.get('/', ghVisitasController.getVisitas);
router.post('/', ghVisitasController.saveVisita);
router.patch('/:id/salida', ghVisitasController.marcarSalida);

export default router;
