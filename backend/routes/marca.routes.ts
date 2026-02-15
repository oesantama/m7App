import { Router } from 'express';
import { getMarcas, saveMarca, deleteMarca } from '../controllers/marca.controller.js';

const router = Router();

router.get('/', getMarcas);
router.post('/', saveMarca);
router.delete('/:id', deleteMarca);

export default router;
