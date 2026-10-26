import { Router } from 'express';
import {
    getElementosDropdown,
    getOrdenesCompra, createOrdenCompra,
    getEntradasBodega, createEntradaBodega,
    getSalidasProveedor, createSalidaProveedor,
    getAvailableSerials,
    getAsignaciones, createAsignacionPersonal, firmarAsignacion, generateAsignacionActaPDF,
    updateAsignacionPersonal, anularAsignacionPersonal, getHistorialAsignacion,
    getDevoluciones, createDevolucionPersonal, firmarDevolucion, generateDevolucionActaPDF,
    getPersonalInventario, getPersonalSerials,
    getInventarioBodega, getInventarioPersonal,
    getUltimaEntregaElemento
} from '../controllers/gh-entradas-salidas.controller.js';
import { requirePermission, authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/dropdown-elementos', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getElementosDropdown);
router.get('/ordenes', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'view'), getOrdenesCompra);
router.post('/ordenes', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'create'), createOrdenCompra);
router.get('/entradas', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'view'), getEntradasBodega);
router.post('/entradas', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'create'), createEntradaBodega);
router.get('/salidas', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'view'), getSalidasProveedor);
router.post('/salidas', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH'], 'create'), createSalidaProveedor);
router.get('/serials/:elemento_id', requirePermission(['MASTER_INVENTARIO_GH', 'ENTREGAS_SALIDAS_GH', 'ASIGNACION_DEVOLUCION_GH'], 'view'), getAvailableSerials);

// Personal Assignments & Returns
router.get('/asignaciones', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'view'), getAsignaciones);
router.post('/asignaciones', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'create'), createAsignacionPersonal);
router.post('/asignaciones/:id/firmar', authenticateToken, firmarAsignacion);
// Editar / anular: solo con permiso y mientras la firma esté pendiente (validado también en el controlador)
router.put('/asignaciones/:id', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'edit'), updateAsignacionPersonal);
router.delete('/asignaciones/:id', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'delete'), anularAsignacionPersonal);
router.get('/asignaciones/:id/historial', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getHistorialAsignacion);
router.get('/asignaciones/:id/acta', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), generateAsignacionActaPDF);
router.get('/ultima-entrega/:personal_id/:elemento_id', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'ENTREGAS_SALIDAS_GH'], 'view'), getUltimaEntregaElemento);

router.get('/devoluciones', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'view'), getDevoluciones);
router.post('/devoluciones', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH'], 'create'), createDevolucionPersonal);
router.post('/devoluciones/:id/firmar', authenticateToken, firmarDevolucion);
router.get('/devoluciones/:id/acta', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), generateDevolucionActaPDF);

router.get('/personal-inventario/:personal_id', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getPersonalInventario);
router.get('/personal-serials/:personal_id/:elemento_id', requirePermission(['MASTER_INVENTARIO_GH', 'ASIGNACION_DEVOLUCION_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getPersonalSerials);
router.get('/inventario-bodega', requirePermission(['MASTER_INVENTARIO_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getInventarioBodega);
router.get('/inventario-personal', requirePermission(['MASTER_INVENTARIO_GH', 'CONSULTA_INVENTARIO_GH'], 'view'), getInventarioPersonal);

export default router;

