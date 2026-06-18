import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  listManuals,
  getManual,
  getManualPdf,
  listComponents,
  getProgress,
  generateManual,
  generateAllManuals,
} from '../controllers/helpdesk.controller.js';

const router = Router();

// Lectura — requiere autenticación
router.get('/manuals', authenticateToken, listManuals);
router.get('/manuals/:name', authenticateToken, getManual);
router.get('/manuals/:name/pdf', authenticateToken, getManualPdf);
router.get('/components', authenticateToken, listComponents);
router.get('/progress', authenticateToken, getProgress);

// Generación
router.post('/generate', authenticateToken, generateManual);
router.post('/generate-all', authenticateToken, generateAllManuals);

export default router;
