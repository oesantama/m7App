import { Router } from 'express';
import {
  getDepartamentos,
  saveDepartamento,
  deleteDepartamento,
  getCiudades,
  saveCiudad,
  deleteCiudad,
} from '../controllers/cfg-ciudades.controller.js';

const router = Router();

router.get('/departamentos', getDepartamentos);
router.post('/departamentos', saveDepartamento);
router.delete('/departamentos/:id', deleteDepartamento);

router.get('/ciudades', getCiudades);
router.post('/ciudades', saveCiudad);
router.delete('/ciudades/:id', deleteCiudad);

export default router;
