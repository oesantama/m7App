import { Router } from 'express';
import { getNotificaciones, saveNotificacion, deleteNotificacion } from '../controllers/notificacion.controller.js';

const router = Router();

router.get('/', getNotificaciones);
router.post('/', saveNotificacion);
router.delete('/:id', deleteNotificacion);

export default router;
