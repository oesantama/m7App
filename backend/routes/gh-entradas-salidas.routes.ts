import { Router } from 'express';
import {
    getElementosDropdown,
    getOrdenesCompra, createOrdenCompra,
    getEntradasBodega, createEntradaBodega,
    getSalidasProveedor, createSalidaProveedor,
    getAvailableSerials,
    getAsignaciones, createAsignacionPersonal, firmarAsignacion, generateAsignacionActaPDF,
    getDevoluciones, createDevolucionPersonal, firmarDevolucion, generateDevolucionActaPDF,
    getPersonalInventario, getPersonalSerials,
    getInventarioBodega, getInventarioPersonal
} from '../controllers/gh-entradas-salidas.controller.js';
import { requirePermission, authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/dropdown-elementos', requirePermission('MASTER_INVENTARIO_GH', 'view'), getElementosDropdown);
router.get('/ordenes', requirePermission('MASTER_INVENTARIO_GH', 'view'), getOrdenesCompra);
router.post('/ordenes', requirePermission('MASTER_INVENTARIO_GH', 'create'), createOrdenCompra);
router.get('/entradas', requirePermission('MASTER_INVENTARIO_GH', 'view'), getEntradasBodega);
router.post('/entradas', requirePermission('MASTER_INVENTARIO_GH', 'create'), createEntradaBodega);
router.get('/salidas', requirePermission('MASTER_INVENTARIO_GH', 'view'), getSalidasProveedor);
router.post('/salidas', requirePermission('MASTER_INVENTARIO_GH', 'create'), createSalidaProveedor);
router.get('/serials/:elemento_id', requirePermission('MASTER_INVENTARIO_GH', 'view'), getAvailableSerials);

// Personal Assignments & Returns
router.get('/asignaciones', requirePermission('MASTER_INVENTARIO_GH', 'view'), getAsignaciones);
router.post('/asignaciones', requirePermission('MASTER_INVENTARIO_GH', 'create'), createAsignacionPersonal);
router.post('/asignaciones/:id/firmar', authenticateToken, firmarAsignacion);
router.get('/asignaciones/:id/acta', requirePermission('MASTER_INVENTARIO_GH', 'view'), generateAsignacionActaPDF);

router.get('/devoluciones', requirePermission('MASTER_INVENTARIO_GH', 'view'), getDevoluciones);
router.post('/devoluciones', requirePermission('MASTER_INVENTARIO_GH', 'create'), createDevolucionPersonal);
router.post('/devoluciones/:id/firmar', authenticateToken, firmarDevolucion);
router.get('/devoluciones/:id/acta', requirePermission('MASTER_INVENTARIO_GH', 'view'), generateDevolucionActaPDF);

router.get('/personal-inventario/:personal_id', requirePermission('MASTER_INVENTARIO_GH', 'view'), getPersonalInventario);
router.get('/personal-serials/:personal_id/:elemento_id', requirePermission('MASTER_INVENTARIO_GH', 'view'), getPersonalSerials);
router.get('/inventario-bodega', requirePermission('MASTER_INVENTARIO_GH', 'view'), getInventarioBodega);
router.get('/inventario-personal', requirePermission('MASTER_INVENTARIO_GH', 'view'), getInventarioPersonal);

export default router;
