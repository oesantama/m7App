import { Router } from 'express';
import { getTiposNotificacion, saveTipoNotificacion, deleteTipoNotificacion } from '../controllers/tipo-notificacion.controller.js';

const router = Router();

router.get('/', getTiposNotificacion);
router.post('/', saveTipoNotificacion);
router.delete('/:id', deleteTipoNotificacion);

export default router;
