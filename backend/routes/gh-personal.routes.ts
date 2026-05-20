import { Router } from 'express';
import {
  getPersonal,
  savePersonal,
  deletePersonal,
  getPersonalEncuestas,
  activateEncuesta,
  deactivateEncuesta,
  validateSurveyAccess,
  savePublicSurvey,
  getEncuestasResultados,
  getEncuestaDetail,
  generateEncuestaPDF,
  exportEncuestasExcel,
  getCapacitaciones,
  saveCapacitacion,
  getAsignacionesCapacitacion,
  asignarCapacitacion,
  getPublicCapacitacion,
  submitCapacitacionResult
} from '../controllers/gh-personal.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission(['PERSONAL_GH', 'MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH', 'VISITAS_GH'], 'view'), getPersonal);
router.post('/', requirePermission('PERSONAL_GH', 'create'), savePersonal);
router.delete('/:id', requirePermission('PERSONAL_GH', 'edit'), deletePersonal);

router.get('/encuestas', requirePermission('PERSONAL_GH', 'view'), getPersonalEncuestas);
router.post('/encuestas/activate', requirePermission('PERSONAL_GH', 'edit'), activateEncuesta);
router.put('/encuestas/deactivate/:id', requirePermission('PERSONAL_GH', 'edit'), deactivateEncuesta);
router.get('/resultados/excel', requirePermission('PERSONAL_GH', 'view'), exportEncuestasExcel);
router.get('/resultados', requirePermission('PERSONAL_GH', 'view'), getEncuestasResultados);
router.get('/resultados/:id', requirePermission('PERSONAL_GH', 'view'), getEncuestaDetail);
router.get('/pdf/:id', requirePermission('PERSONAL_GH', 'view'), generateEncuestaPDF);

// LMS Routes
router.get('/capacitaciones', requirePermission(['CAPACITACIONES', 'PERSONAL_GH'], 'view'), getCapacitaciones);
router.post('/capacitaciones', requirePermission(['CAPACITACIONES', 'PERSONAL_GH'], 'create'), saveCapacitacion);
router.get('/capacitaciones/asignaciones/:capId', requirePermission(['CAPACITACIONES', 'PERSONAL_GH'], 'view'), getAsignacionesCapacitacion);
router.post('/capacitaciones/asignar', requirePermission(['CAPACITACIONES', 'PERSONAL_GH'], 'create'), asignarCapacitacion);
router.get('/capacitaciones/publica', getPublicCapacitacion);
router.post('/capacitaciones/submit', submitCapacitacionResult);

// Rutas Públicas (Whitelisted en server.ts)
router.get('/public/survey/validate', validateSurveyAccess);
router.post('/public/survey/save', savePublicSurvey);

export default router;
