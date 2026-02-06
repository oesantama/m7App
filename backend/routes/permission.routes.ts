
import { Router } from 'express';
import { getRolePermissions, saveRolePermission, deleteRolePermission } from '../controllers/permission.controller.js';

const router = Router();

router.get('/', getRolePermissions);
router.post('/', saveRolePermission);
router.delete('/:id', deleteRolePermission);

export default router;
