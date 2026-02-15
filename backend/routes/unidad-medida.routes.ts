import { Router } from 'express';
import { getUnidadesMedida, saveUnidadMedida, deleteUnidadMedida } from '../controllers/unidad-medida.controller.js';

const router = Router();

router.get('/', getUnidadesMedida);
router.post('/', saveUnidadMedida);
router.delete('/:id', deleteUnidadMedida);

export default router;
