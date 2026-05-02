
import { Router } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware.js';
import {
  getVehicleInventory,
  getRouteAssignmentItems,
  getSupplierReturns,
  createSupplierReturn,
  confirmSupplierReturn,
  getConciliationHeaders,
  saveConciliationHeader,
  approveConciliationHeader,
  getInventoryStock,
  getInventoryMovements,
  getArticleDashboardSummary,
} from '../controllers/inventory.controller.js';

const router = Router();

// Permiso flexible: admin, PAG-15 (planificador), PAG-16 (documentos), PAG-17 (recibido)
const requireInventoryView = (req: any, res: any, next: any) => {
  const user = req.user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-15', 'PAG-16', 'PAG-17', 'PAG-30', 'PAG-01'].includes(p.module) &&
    p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente' });
};

const requireInventoryEdit = (req: any, res: any, next: any) => {
  const user = req.user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-15', 'PAG-16', 'PAG-17'].includes(p.module) &&
    p.actions.includes('edit')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para esta operación' });
};

// ─── Inventario de Vehículo ───────────────────────────────────────────────────
router.get('/vehicle', requireInventoryView, getVehicleInventory);

// ─── Histórico de Asignaciones por Ruta ──────────────────────────────────────
router.get('/route-assignments', requireInventoryView, getRouteAssignmentItems);

// ─── Devoluciones a Proveedor ─────────────────────────────────────────────────
router.get('/supplier-returns', requireInventoryView, getSupplierReturns);
router.post('/supplier-returns', requireInventoryEdit, createSupplierReturn);
router.patch('/supplier-returns/:id/confirm', requireInventoryEdit, confirmSupplierReturn);

// ─── Conciliación (Cabecera + Transacciones) ──────────────────────────────────
router.get('/conciliation-headers', requireInventoryView, getConciliationHeaders);
router.post('/conciliation-headers', requireInventoryEdit, saveConciliationHeader);
router.patch('/conciliation-headers/:id/approve', requireInventoryEdit, approveConciliationHeader);

// ─── Consulta de Stock e Inventario ──────────────────────────────────────────
router.get('/stock',     requireInventoryView, getInventoryStock);
router.get('/movements', requireInventoryView, getInventoryMovements);
router.get('/dashboard-summary', requireInventoryView, getArticleDashboardSummary);

export default router;
