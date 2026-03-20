
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, createManualDocument, updateStatus, getInvoices, deleteDocument, resendInventoryNotification, processDocumentLPayment, getInventoryLog, getMastersuiteReport } from '../controllers/document.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Middleware flexible para permitir Auditoría tanto a Admins como a Auxiliares (PAG-17/PAG-30)
const requireAuditEdit = (req: any, res: any, next: any) => {
  const user = req.user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) => 
    (p.module === 'PAG-16' || p.module === 'DOCUMENTOS_L' || p.module === 'PAG-17' || p.module === 'PAG-30') && 
    (p.actions.includes('edit') || p.actions.includes('create'))
  );

  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente. Se requiere DOCUMENTOS_L:edit o acceso a Recibido.' });
};

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasDocsPerm = user?.permissions?.some((p: any) => p.module === 'PAG-16' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));
  const hasRecibidoPerm = user?.permissions?.some((p: any) => p.module === 'PAG-17' && p.actions.includes('view'));
  const hasManualPerm = user?.permissions?.some((p: any) => p.module === 'PAG-30' && p.actions.includes('view'));

  if (isSuper || hasDocsPerm || hasRutasPerm || hasRecibidoPerm || hasManualPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver documentos' });
}, getDocuments);
router.post('/bulk', requirePermission('DOCUMENTOS_L', 'create'), bulkCreateDocuments);
router.post('/manual', requirePermission('PAG-30', 'create'), createManualDocument);
router.patch('/status/:id', requireAuditEdit, updateStatus);
router.delete('/:id', requirePermission('DOCUMENTOS_L', 'delete'), deleteDocument);
router.post('/sync-inventory', requireAuditEdit, syncInventory);
router.post('/resend-notification', requireAuditEdit, resendInventoryNotification);

// Log de Existencias — inventario_clientes acumulado por cliente/artículo
router.get('/inventory-log', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    (p.module === 'PAG-16' || p.module === 'PAG-17' || p.module === 'PAG-01') &&
    p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver existencias' });
}, getInventoryLog);
router.get('/invoices', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasDocsPerm = user?.permissions?.some((p: any) => p.module === 'PAG-16' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));
  const hasRecibidoPerm = user?.permissions?.some((p: any) => p.module === 'PAG-17' && p.actions.includes('view'));
  const hasManualPerm = user?.permissions?.some((p: any) => p.module === 'PAG-30' && p.actions.includes('view'));

  if (isSuper || hasDocsPerm || hasRutasPerm || hasRecibidoPerm || hasManualPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver facturas' });
}, getInvoices);
router.post('/process-l-payment', requirePermission('DOCUMENTOS_L', 'edit'), processDocumentLPayment);
router.get('/mastersuite-report', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) => (p.module === 'PAG-34' || p.module === 'PAG-16' || p.module === 'PAG-15') && p.actions.includes('view'));
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente' });
}, getMastersuiteReport);


export default router;
