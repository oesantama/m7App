
import { Router } from 'express';
import { getStatus, reconnect, disconnect, getHistory, sendNotification } from '../controllers/whatsapp.controller.js';

const router = Router();

router.get('/status', getStatus);
router.post('/connect', reconnect);
router.post('/disconnect', disconnect);
router.get('/history', getHistory);
router.post('/send', sendNotification);

export default router;
