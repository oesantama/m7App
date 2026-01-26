
import { Router } from 'express';
import { getClients, saveClient } from '../controllers/client.controller.js';

const router = Router();

router.get('/', getClients);
router.post('/', saveClient);

export default router;
