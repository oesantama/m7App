
import { Router } from 'express';
import { handleRestoreSystem } from '../controllers/system.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

router.post('/restore', requirePermission('SISTEMA', 'edit'), handleRestoreSystem);


export default router;
