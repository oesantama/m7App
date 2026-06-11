import { Router } from 'express';
import multer from 'multer';
import * as cap from '../controllers/cap.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// ── Admin (requieren auth + permiso CAPACITACIONES) ───────────────────────────
router.get('/capacitaciones', cap.getCapacitaciones);
router.get('/capacitaciones/:id', requirePermission('CAPACITACIONES', 'view'), cap.getCapacitacionById);
router.post('/capacitaciones', requirePermission('CAPACITACIONES', 'create'), cap.saveCapacitacion);
router.put('/capacitaciones/:id', requirePermission('CAPACITACIONES', 'edit'), cap.saveCapacitacion);
router.delete('/capacitaciones/:id', requirePermission('CAPACITACIONES', 'delete'), cap.deleteCapacitacion);

router.post('/recursos', requirePermission('CAPACITACIONES', 'create'), upload.single('file'), cap.uploadRecurso);
router.delete('/recursos/:id', requirePermission('CAPACITACIONES', 'delete'), cap.deleteRecurso);

router.get('/asignaciones', requirePermission('CAPACITACIONES', 'view'), cap.getAsignaciones);
router.post('/asignaciones', requirePermission('CAPACITACIONES', 'create'), cap.asignar);
router.post('/asignaciones/:id/reset', requirePermission('CAPACITACIONES', 'edit'), cap.resetAsignacion);
router.patch('/asignaciones/:id/intentos', requirePermission('CAPACITACIONES', 'edit'), cap.ampliarIntentos);
router.patch('/asignaciones/:id/fechas',   requirePermission('CAPACITACIONES', 'edit'), cap.actualizarFechasAsignacion);
router.get('/asignaciones/:id/intentos', requirePermission('CAPACITACIONES', 'view'), cap.getIntentosByAsignacion);

router.get('/dashboard', requirePermission('CAPACITACIONES', 'view'), cap.getDashboard);
router.get('/certificados/:numero', requirePermission('CAPACITACIONES', 'view'), cap.getCertificado);
router.get('/certificados/asignacion/:asignacion_id', requirePermission('CAPACITACIONES', 'view'), cap.getCertificadosByAsignacion);
router.get('/cargos', requirePermission('CAPACITACIONES', 'view'), cap.getCargos);

router.get('/capacitaciones/:id/preview', requirePermission('CAPACITACIONES', 'create'), cap.getCapacitacionPreview);
router.get('/especialistas',     requirePermission('CAPACITACIONES', 'create'), cap.getEspecialistas);
router.post('/especialistas',    requirePermission('CAPACITACIONES', 'create'), cap.saveEspecialista);
router.put('/especialistas/:id', requirePermission('CAPACITACIONES', 'create'), cap.saveEspecialista);
router.delete('/especialistas/:id', requirePermission('CAPACITACIONES', 'create'), cap.deleteEspecialista);

// ── Públicas (whitelisteadas en server.ts, sin auth) ─────────────────────────
router.get('/public/capacitacion', cap.getPublicCapacitacion);
router.post('/public/intento/start', cap.iniciarIntento);
router.post('/public/intento/submit', cap.submitIntento);
router.get('/public/certificado/:numero', cap.getCertificado);
router.get('/public/recursos/:id/stream', cap.streamRecurso);

export default router;
