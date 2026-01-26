
import { Router } from 'express';
import { getUserPermissions, saveUserPermission } from '../controllers/user-permission.controller.js';

const router = Router();

router.get('/:userId', getUserPermissions);
router.post('/', saveUserPermission);

export default router;
