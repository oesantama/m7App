
import { Router } from 'express';
import { getDrivers, saveDriver, deleteDriver, bulkSaveDrivers } from '../controllers/driver.controller.js';

const router = Router();

router.get('/', getDrivers);
router.post('/', saveDriver);
router.post('/bulk', bulkSaveDrivers);
router.delete('/:id', deleteDriver);

export default router;
