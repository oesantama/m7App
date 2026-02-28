
import { Router } from 'express';
import { notifyTest, notifyWhatsAppTest } from '../controllers/notification.controller.js';
import { getStatus } from '../controllers/whatsapp.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/test-email', requirePermission('CONFIGURACION', 'edit'), notifyTest);
router.post('/test-whatsapp', requirePermission('CONFIGURACION', 'edit'), notifyWhatsAppTest);
router.get('/qr', requirePermission('CONFIGURACION', 'view'), getStatus);


export default router;
