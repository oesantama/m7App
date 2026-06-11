import { Router } from 'express';
import { getNotificacionesWhatsapp, saveNotificacionWhatsapp, deleteNotificacionWhatsapp } from '../controllers/notificacion-whatsapp.controller.js';

const router = Router();

router.get('/', getNotificacionesWhatsapp);
router.post('/', saveNotificacionWhatsapp);
router.put('/', saveNotificacionWhatsapp);
router.delete('/:id', deleteNotificacionWhatsapp);

export default router;
