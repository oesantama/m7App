
import { Router } from 'express';
import { getVehicles, saveVehicle, deleteVehicle } from '../controllers/vehicle.controller.js';

const router = Router();

router.get('/', getVehicles);
router.post('/', saveVehicle);
router.delete('/:id', deleteVehicle);

export default router;
