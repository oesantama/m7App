
import { Router } from 'express';
import { getClients, saveClient, deleteClient } from '../controllers/client.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission('CLIENTES', 'view'), getClients);
router.post('/', requirePermission('CLIENTES', 'create'), saveClient);
router.delete('/:id', requirePermission('CLIENTES', 'delete'), deleteClient);


export default router;
