import { Router } from 'express';
import { 
    getTiposElementos, createTipoElemento, updateTipoElemento, deleteTipoElemento,
    getElementos, createElemento, updateElemento, deleteElemento
} from '../controllers/gh-master-inventario.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Tipos Elementos
router.get('/tipos', requirePermission('MASTER_INVENTARIO_GH', 'view'), getTiposElementos);
router.post('/tipos', requirePermission('MASTER_INVENTARIO_GH', 'create'), createTipoElemento);
router.put('/tipos/:id', requirePermission('MASTER_INVENTARIO_GH', 'edit'), updateTipoElemento);
router.delete('/tipos/:id', requirePermission('MASTER_INVENTARIO_GH', 'delete'), deleteTipoElemento);

// Elementos
router.get('/elementos', requirePermission('MASTER_INVENTARIO_GH', 'view'), getElementos);
router.post('/elementos', requirePermission('MASTER_INVENTARIO_GH', 'create'), createElemento);
router.put('/elementos/:id', requirePermission('MASTER_INVENTARIO_GH', 'edit'), updateElemento);
router.delete('/elementos/:id', requirePermission('MASTER_INVENTARIO_GH', 'delete'), deleteElemento);

export default router;
