
import { Router } from 'express';
import { notifyTest, notifyWhatsAppTest } from '../controllers/notification.controller.js';

const router = Router();

router.post('/test-email', notifyTest);
router.post('/test-whatsapp', notifyWhatsAppTest);

export default router;
