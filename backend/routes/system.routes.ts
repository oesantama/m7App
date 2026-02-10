
import { Router } from 'express';
import { handleRestoreSystem } from '../controllers/system.controller.js';

const router = Router();

router.post('/restore', handleRestoreSystem);

export default router;
