
import { Router } from 'express';
import { getVehicleTelemetry, getFleetHealth } from '../controllers/telemetry.controller.js';

const router = Router();

router.get('/vehicle/:plate/latest', getVehicleTelemetry);
router.get('/health', getFleetHealth);

export default router;
