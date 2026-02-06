
import { Router } from 'express';
import { getRoles, saveRole, deleteRole } from '../controllers/role.controller.js';

const router = Router();

router.get('/', getRoles);
router.post('/', saveRole);
router.delete('/:id', deleteRole);

export default router;
