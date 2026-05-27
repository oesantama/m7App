
import { Router } from 'express';
import * as newsCtrl from '../controllers/inventory-news.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/:docId', authenticateToken, newsCtrl.getNovedades);
router.post('/', authenticateToken, newsCtrl.saveNovedad);
router.post('/send-report', authenticateToken, newsCtrl.sendNovedadesReport);
router.post('/save-to-drive', authenticateToken, newsCtrl.saveNovedadToDrive);

export default router;
