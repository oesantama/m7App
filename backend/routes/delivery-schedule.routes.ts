import { Router } from 'express';
import { getDeliverySchedules, upsertDeliverySchedule, deleteDeliverySchedule, deleteAllDeliverySchedules } from '../controllers/delivery-schedule.controller.js';

const router = Router();

router.get('/',       getDeliverySchedules);
router.post('/',      upsertDeliverySchedule);
router.delete('/:id', deleteDeliverySchedule);
router.delete('/',    deleteAllDeliverySchedules);

export default router;
