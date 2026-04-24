
import { Router } from 'express';
import { getVehicles, saveVehicle, deleteVehicle, bulkSaveVehicles } from '../controllers/vehicle.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', getVehicles);
router.post('/', requirePermission('VEHICULOS', 'create'), saveVehicle);
router.post('/bulk', requirePermission('VEHICULOS', 'create'), bulkSaveVehicles);
router.delete('/:id', requirePermission('VEHICULOS', 'delete'), deleteVehicle);


export default router;
