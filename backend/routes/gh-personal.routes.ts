import { Router } from 'express';
import {
  getPersonal,
  savePersonal,
  deletePersonal,
  getPersonalEncuestas,
  activateEncuesta
} from '../controllers/gh-personal.controller.js';

const router = Router();

router.get('/', getPersonal);
router.post('/', savePersonal);
router.delete('/:id', deletePersonal);

router.get('/encuestas', getPersonalEncuestas);
router.post('/encuestas/activate', activateEncuesta);

export default router;
