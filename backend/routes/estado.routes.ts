import { Router } from 'express';
import { getEstados, saveEstado, deleteEstado } from '../controllers/estado.controller.js';

const router = Router();

router.get('/', getEstados);
router.post('/', saveEstado);
router.delete('/:id', deleteEstado);

export default router;
