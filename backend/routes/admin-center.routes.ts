import { Router } from 'express';
import { getFormatosTransportes } from '../controllers/admin-center.controller.js';

const router = Router();

router.get('/formatos', getFormatosTransportes);

export default router;
