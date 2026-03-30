
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { initPicking, finishPicking, signPicking, getPickingStatus } from '../controllers/picking.controller.js';

const router = Router();

router.post('/init', authenticateToken, initPicking);
router.post('/finish', authenticateToken, finishPicking);
router.post('/sign', authenticateToken, signPicking);
router.get('/status/:invoiceId', authenticateToken, getPickingStatus);

export default router;
