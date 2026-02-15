import { Router } from 'express';
import { getTiposDocumento, saveTipoDocumento, deleteTipoDocumento } from '../controllers/tipo-documento.controller.js';

const router = Router();

router.get('/', getTiposDocumento);
router.post('/', saveTipoDocumento);
router.delete('/:id', deleteTipoDocumento);

export default router;
