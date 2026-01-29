
import { Router } from 'express';
import { notifyTest, notifyWhatsAppTest } from '../controllers/notification.controller.js';
import { getStatus } from '../controllers/whatsapp.controller.js';

const router = Router();

router.post('/test-email', notifyTest);
router.post('/test-whatsapp', notifyWhatsAppTest);
router.get('/qr', getStatus);

export default router;
