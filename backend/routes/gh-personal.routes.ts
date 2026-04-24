import { Router } from 'express';
import {
  getPersonal,
  savePersonal,
  deletePersonal,
  getPersonalEncuestas,
  activateEncuesta,
  deactivateEncuesta,
  validateSurveyAccess,
  savePublicSurvey
} from '../controllers/gh-personal.controller.js';

const router = Router();

router.get('/', getPersonal);
router.post('/', savePersonal);
router.delete('/:id', deletePersonal);

router.get('/encuestas', getPersonalEncuestas);
router.post('/encuestas/activate', activateEncuesta);
router.put('/encuestas/deactivate/:id', deactivateEncuesta);

// Rutas Públicas (Whitelisted en server.ts)
router.get('/public/survey/validate', validateSurveyAccess);
router.post('/public/survey/save', savePublicSurvey);

export default router;
