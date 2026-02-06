import { Router } from 'express';
import { getAllUserPermissions, getUserPermissions, saveUserPermission, deleteUserPermission } from '../controllers/user-permission.controller.js';

const router = Router();

router.get('/', getAllUserPermissions);
router.get('/:userId', getUserPermissions);
router.post('/', saveUserPermission);
router.delete('/:id', deleteUserPermission);

export default router;
