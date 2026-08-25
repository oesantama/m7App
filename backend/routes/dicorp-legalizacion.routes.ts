import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  uploadEntregas,
  previewEntregas,
  getEncabezados,
  getEncabezadoDetalle,
  checkComprobante,
  savePagoIndividual,
  savePagoGrupal,
  saveDevolucion,
  saveSobrecosto,
  updateSobrecosto,
  aprobarSobrecosto,
  getResumenPlacas,
  getConsolidadoPendientes,
  getConsolidadoPorFecha,
  cerrarPlacaDia,
  cambiarEstado,
  anularPagoIndividual,
  anularPagoGrupal,
  anularDevolucion,
  anularSobrecosto,
} from '../controllers/dicorp-legalizacion.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.use(authenticateToken);

router.post('/upload-preview',                upload.single('file'), previewEntregas);
router.post('/upload',                       upload.single('file'), uploadEntregas);
router.get('/encabezados',                   getEncabezados);
router.get('/encabezados/:id',                getEncabezadoDetalle);
router.put('/encabezados/:id/estado',         cambiarEstado);
router.get('/check-comprobante/:reference',   checkComprobante);
router.post('/pagos-individuales',            savePagoIndividual);
router.put('/pagos-individuales/:id/anular',  anularPagoIndividual);
router.post('/pagos-grupales',                savePagoGrupal);
router.put('/pagos-grupales/:id/anular',      anularPagoGrupal);
router.post('/devoluciones',                  saveDevolucion);
router.put('/devoluciones/:id/anular',        anularDevolucion);
router.post('/sobrecostos',                   saveSobrecosto);
router.put('/sobrecostos/:id',                updateSobrecosto);
router.put('/sobrecostos/:id/aprobar',        aprobarSobrecosto);
router.put('/sobrecostos/:id/anular',         anularSobrecosto);
router.get('/resumen-placas',                 getResumenPlacas);
router.get('/consolidado-pendientes',         getConsolidadoPendientes);
router.get('/consolidado-por-fecha',          getConsolidadoPorFecha);
router.put('/cerrar-placa-dia',               cerrarPlacaDia);

export default router;
