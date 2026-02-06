
import { Router } from 'express';
import { getClients, saveClient, deleteClient } from '../controllers/client.controller.js';

const router = Router();

router.get('/', getClients);
router.post('/', saveClient);
router.delete('/:id', deleteClient);

export default router;
