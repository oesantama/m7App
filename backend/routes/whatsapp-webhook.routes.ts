import { Router } from 'express';
import { recibirWebhook } from '../controllers/whatsapp-webhook.controller.js';

const router = Router();

router.post('/:instance', recibirWebhook);

export default router;
