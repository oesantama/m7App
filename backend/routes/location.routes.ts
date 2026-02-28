import { Router } from 'express';
import { updateVehicleLocation, getLatestVehicleLocations, getVehicleLocationHistory } from '../controllers/location.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

router.post('/update', requirePermission('UBICACIONES', 'edit'), updateVehicleLocation);
router.get('/latest', requirePermission('UBICACIONES', 'view'), getLatestVehicleLocations);
router.get('/history/:vehicleId', requirePermission('UBICACIONES', 'view'), getVehicleLocationHistory);


export default router;
