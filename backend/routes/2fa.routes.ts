
import { Router } from 'express';
import { twoFactorController } from '../controllers/2fa.controller.js';

const router = Router();

// Endpoints de configuración 2FA
router.post('/setup', twoFactorController.generateSetup);
router.post('/activate', twoFactorController.activate);
router.post('/verify', twoFactorController.verifyToken);
router.post('/deactivate', twoFactorController.deactivate);

export default router;
