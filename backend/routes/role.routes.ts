
import { Router } from 'express';
import { getRoles, saveRole } from '../controllers/role.controller.js';

const router = Router();

router.get('/', getRoles);
router.post('/', saveRole);

export default router;
