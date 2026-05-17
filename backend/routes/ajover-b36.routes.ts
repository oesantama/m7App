import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  uploadAuditoriaB36,
  getEncabezados,
  getDetalle,
  exportAuditoriaExcel,
  exportAllAuditoriaExcel,
  getSobrecostos,
  updatePlanilla,
  deleteEncabezado,
  addDetalle,
  deleteDetalle,
  getLogs,
  getPlacasConciliacion,
  saveConciliacionB36,
  asignarPlacaB36,
} from '../controllers/ajover-b36.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.use(authenticateToken);

router.post('/upload',              upload.single('file'), uploadAuditoriaB36);
router.get('/encabezados',          getEncabezados);
router.get('/detalle/:encId',       getDetalle);
router.get('/export-all',          exportAllAuditoriaExcel);
router.get('/export/:encId',        exportAuditoriaExcel);
router.get('/sobrecostos/:encId',   getSobrecostos);
router.put('/planilla/:id',        updatePlanilla);
router.delete('/encabezado/:id',    deleteEncabezado);
router.post('/detalle',             addDetalle);
router.delete('/detalle/:id',       deleteDetalle);
router.get('/logs/:encId',          getLogs);
router.get('/conciliacion',         getPlacasConciliacion);
router.post('/conciliacion',        saveConciliacionB36);
router.put('/asignar-placa/:encId', asignarPlacaB36);

export default router;

