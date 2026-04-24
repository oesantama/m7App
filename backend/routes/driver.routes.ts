
import { Router } from 'express';
import { getDrivers, saveDriver, deleteDriver, bulkSaveDrivers } from '../controllers/driver.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', getDrivers);
router.post('/', requirePermission('CONDUCTORES', 'create'), saveDriver);
router.post('/bulk', requirePermission('CONDUCTORES', 'create'), bulkSaveDrivers);
router.delete('/:id', requirePermission('CONDUCTORES', 'delete'), deleteDriver);


export default router;
