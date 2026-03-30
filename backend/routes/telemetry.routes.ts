
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { getVehicleTelemetry, getFleetHealth } from '../controllers/telemetry.controller.js';

const router = Router();

router.get('/vehicle/:plate/latest', authenticateToken, getVehicleTelemetry);
router.get('/health', authenticateToken, getFleetHealth);

export default router;
