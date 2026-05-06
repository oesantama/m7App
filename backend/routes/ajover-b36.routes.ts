import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  uploadAuditoriaB36,
  getEncabezados,
  getDetalle,
  exportAuditoriaExcel,
  deleteEncabezado,
} from '../controllers/ajover-b36.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateToken);

router.post('/upload',              upload.single('file'), uploadAuditoriaB36);
router.get('/encabezados',          getEncabezados);
router.get('/detalle/:encId',       getDetalle);
router.get('/export/:encId',        exportAuditoriaExcel);
router.delete('/encabezado/:id',    deleteEncabezado);

export default router;
