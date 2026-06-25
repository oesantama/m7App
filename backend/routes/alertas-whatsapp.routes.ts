import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  getAlertasWhatsapp,
  saveAlertaWhatsapp,
  deleteAlertaWhatsapp,
  sendTestAlerta,
} from '../controllers/alertas-whatsapp.controller.js';

const router = Router();

router.get('/', authenticateToken, getAlertasWhatsapp);
router.post('/', authenticateToken, saveAlertaWhatsapp);
router.put('/', authenticateToken, saveAlertaWhatsapp);
router.delete('/:id', authenticateToken, deleteAlertaWhatsapp);
router.post('/:id/test', authenticateToken, sendTestAlerta);

export default router;
