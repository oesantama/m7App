import { Router } from 'express';
import {
  getDepartamentos,
  saveDepartamento,
  bulkSaveDepartamentos,
  deleteDepartamento,
  getCiudades,
  saveCiudad,
  bulkSaveCiudades,
  deleteCiudad,
} from '../controllers/cfg-ciudades.controller.js';

const router = Router();

router.get('/departamentos', getDepartamentos);
router.post('/departamentos', saveDepartamento);
router.post('/departamentos/bulk', bulkSaveDepartamentos);
router.delete('/departamentos/:id', deleteDepartamento);

router.get('/ciudades', getCiudades);
router.post('/ciudades', saveCiudad);
router.post('/ciudades/bulk', bulkSaveCiudades);
router.delete('/ciudades/:id', deleteCiudad);

export default router;
