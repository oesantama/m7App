
import { Router } from 'express';
import { getDrivers, saveDriver, deleteDriver } from '../controllers/driver.controller.js';

const router = Router();

router.get('/', getDrivers);
router.post('/', saveDriver);
router.delete('/:id', deleteDriver);

export default router;
