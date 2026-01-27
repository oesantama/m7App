
import { Router } from 'express';
import { getStatus, reconnect } from '../controllers/whatsapp.controller.js';

const router = Router();

router.get('/status', getStatus);
router.post('/connect', reconnect);

export default router;
