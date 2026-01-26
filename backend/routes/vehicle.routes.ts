
import { Router } from 'express';
import { getVehicles, saveVehicle } from '../controllers/vehicle.controller.js';

const router = Router();

router.get('/', getVehicles);
router.post('/', saveVehicle);

export default router;
