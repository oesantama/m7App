import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware.js';
import * as fulfillment from '../controllers/fulfillment.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();
router.use(authenticateToken);

// ── Maestras: Clientes/Marcas (sin eliminar — solo editar / activar-inactivar) ─
router.get('/clientes',            requirePermission('MAESTRAS_FULFILLMENT', 'view'),   fulfillment.getClientes);
router.post('/clientes',           requirePermission('MAESTRAS_FULFILLMENT', 'create'), fulfillment.createCliente);
router.put('/clientes/:id',        requirePermission('MAESTRAS_FULFILLMENT', 'edit'),   fulfillment.updateCliente);

// ── Maestras: Transportistas (sin eliminar — solo editar / activar-inactivar) ─
router.get('/transportistas',        requirePermission('MAESTRAS_FULFILLMENT', 'view'),   fulfillment.getTransportistas);
router.post('/transportistas',       requirePermission('MAESTRAS_FULFILLMENT', 'create'), fulfillment.createTransportista);
router.put('/transportistas/:id',    requirePermission('MAESTRAS_FULFILLMENT', 'edit'),   fulfillment.updateTransportista);

// ── Maestras: Productos / Servicios (sin eliminar — solo editar / activar-inactivar) ─
router.get('/productos',        requirePermission('MAESTRAS_FULFILLMENT', 'view'),   fulfillment.getProductos);
router.post('/productos',       requirePermission('MAESTRAS_FULFILLMENT', 'create'), fulfillment.createProducto);
router.put('/productos/:id',    requirePermission('MAESTRAS_FULFILLMENT', 'edit'),   fulfillment.updateProducto);

// ── Registro y Legalización ─────────────────────────────────────────────────
router.get('/registros',           requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'view'),   fulfillment.getRegistros);
router.post('/registros',          requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'create'), fulfillment.createRegistroVacio);
router.get('/registros/:id',       requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'view'),   fulfillment.getRegistroDetalle);
router.put('/registros/:id',       requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'edit'),   fulfillment.updateRegistro);
router.delete('/registros/:id',    requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'delete'), fulfillment.deleteRegistro);
router.get('/resumen-gerencial',   requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'view'),   fulfillment.getResumenGerencial);
router.get('/plantilla', requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'view'), fulfillment.getPlantillaFulfillment);
router.post('/importar', requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'create'), upload.single('file'), fulfillment.importFulfillmentXlsx);
router.post('/detalle-manual', requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'create'), fulfillment.createDetalleManual);
router.put('/detalle/:id',    requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'edit'),   fulfillment.updateDetalleManual);
router.delete('/detalle/:id', requirePermission('REGISTRO_LEGALIZACION_FULFILLMENT', 'delete'), fulfillment.deleteDetalleManual);

export default router;
