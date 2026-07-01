import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
    getSources, createSource, updateSource, deleteSource,
    getRecords, runValidation, getLocalPdf
} from '../controllers/validation.controller.js';

const router = Router();

// PDF local: sin auth (se abre en pestaña nueva sin token)
router.get('/pdf/:folder/:filename', getLocalPdf);

router.use(authenticateToken);

// Fuentes
router.get('/sources',          getSources);
router.post('/sources',         createSource);
router.put('/sources/:id',      updateSource);
router.delete('/sources/:id',   deleteSource);

// Historial
router.get('/records',          getRecords);

// Ejecutar validación
router.post('/run',             runValidation);

export default router;
