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

const router = Router();

router.get('/', getPersonal);
router.post('/', savePersonal);
router.delete('/:id', deletePersonal);

router.get('/encuestas', getPersonalEncuestas);
router.post('/encuestas/activate', activateEncuesta);
router.put('/encuestas/deactivate/:id', deactivateEncuesta);
router.get('/resultados', getEncuestasResultados);
router.get('/resultados/:id', getEncuestaDetail);
router.get('/resultados/excel', exportEncuestasExcel);
router.get('/pdf/:id', generateEncuestaPDF);

// LMS Routes
router.get('/capacitaciones', getCapacitaciones);
router.post('/capacitaciones', saveCapacitacion);
router.get('/capacitaciones/asignaciones/:capId', getAsignacionesCapacitacion);
router.post('/capacitaciones/asignar', asignarCapacitacion);
router.get('/capacitaciones/publica', getPublicCapacitacion);
router.post('/capacitaciones/submit', submitCapacitacionResult);

// Rutas Públicas (Whitelisted en server.ts)
router.get('/public/survey/validate', validateSurveyAccess);
router.post('/public/survey/save', savePublicSurvey);

export default router;
