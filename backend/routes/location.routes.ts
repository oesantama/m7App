import { Router } from 'express';
import { updateVehicleLocation, getLatestVehicleLocations, getVehicleLocationHistory } from '../controllers/location.controller.js';

const router = Router();

router.post('/update', updateVehicleLocation);
router.get('/latest', getLatestVehicleLocations);
router.get('/history/:vehicleId', getVehicleLocationHistory);

export default router;
