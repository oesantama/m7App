
import { Router } from 'express';
import { getRolePermissions, saveRolePermission } from '../controllers/permission.controller.js';

const router = Router();

router.get('/', getRolePermissions);
router.post('/', saveRolePermission);

export default router;
