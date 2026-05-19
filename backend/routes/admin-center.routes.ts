import { Router } from 'express';
import { getFormatosTransportes, updateFormatoTransporte } from '../controllers/admin-center.controller.js';

const router = Router();

router.get('/formatos', getFormatosTransportes);
router.put('/formatos/:oldId', updateFormatoTransporte);

export default router;
