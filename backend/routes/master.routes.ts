import { Router } from 'express';
import { saveMasterRecord, getMasters } from '../controllers/master.controller.js';

const router = Router();

router.get('/', getMasters);
router.post('/:category', saveMasterRecord);

export default router;
