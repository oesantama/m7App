
import { Router } from 'express';
import { initPicking, finishPicking, signPicking, getPickingStatus } from '../controllers/picking.controller.js';

const router = Router();

router.post('/init', initPicking);
router.post('/finish', finishPicking);
router.post('/sign', signPicking);
router.get('/status/:invoiceId', getPickingStatus);

export default router;
