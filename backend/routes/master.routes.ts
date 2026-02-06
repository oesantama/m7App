import { Router } from 'express';
import { saveMasterRecord, getMasters, deleteMasterRecord } from '../controllers/master.controller.js';

const router = Router();

router.get('/', getMasters);
router.post('/:category', saveMasterRecord);
router.delete('/:category/:id', deleteMasterRecord);

export default router;
