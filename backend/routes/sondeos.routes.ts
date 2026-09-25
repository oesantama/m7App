import { Router } from 'express';
import * as sondeos from '../controllers/sondeos.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes (sin JWT para enlace directo)
router.get('/public/:id', sondeos.getEncuestaPublica);
router.post('/public/:id/submit', sondeos.submitRespuesta);

// App user feed
router.get('/feed', authenticateToken, sondeos.getEncuestasApp);

// Admin / Author routes (requieren auth)
router.get('/', authenticateToken, sondeos.getEncuestas);
router.get('/:id', authenticateToken, sondeos.getEncuestaById);
router.post('/', authenticateToken, sondeos.saveEncuesta);
router.put('/:id', authenticateToken, sondeos.saveEncuesta);
router.delete('/:id', authenticateToken, sondeos.deleteEncuesta);
router.get('/:id/resultados', authenticateToken, sondeos.getResultadosEncuesta);

export default router;
