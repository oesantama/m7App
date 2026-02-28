
import { Router } from 'express';
import { getUsers, saveUser, deleteUser } from '../controllers/user.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission('USUARIOS', 'view'), getUsers);
router.post('/', requirePermission('USUARIOS', 'create'), saveUser);
router.delete('/:id', requirePermission('USUARIOS', 'delete'), deleteUser);


export default router;
