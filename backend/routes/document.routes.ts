
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, updateStatus, getInvoices, deleteDocument, resendInventoryNotification, processDocumentLPayment } from '../controllers/document.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasDocsPerm = user?.permissions?.some((p: any) => p.module === 'PAG-16' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));
  const hasRecibidoPerm = user?.permissions?.some((p: any) => p.module === 'PAG-17' && p.actions.includes('view'));

  if (isSuper || hasDocsPerm || hasRutasPerm || hasRecibidoPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver documentos' });
}, getDocuments);
router.post('/bulk', requirePermission('DOCUMENTOS_L', 'create'), bulkCreateDocuments);
router.patch('/status/:id', requirePermission('DOCUMENTOS_L', 'edit'), updateStatus);
router.delete('/:id', requirePermission('DOCUMENTOS_L', 'delete'), deleteDocument);
router.post('/sync-inventory', requirePermission('DOCUMENTOS_L', 'edit'), syncInventory);
router.post('/resend-notification', requirePermission('DOCUMENTOS_L', 'edit'), resendInventoryNotification);
router.get('/invoices', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasDocsPerm = user?.permissions?.some((p: any) => p.module === 'PAG-16' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));
  const hasRecibidoPerm = user?.permissions?.some((p: any) => p.module === 'PAG-17' && p.actions.includes('view'));

  if (isSuper || hasDocsPerm || hasRutasPerm || hasRecibidoPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver facturas' });
}, getInvoices);
router.post('/process-l-payment', requirePermission('DOCUMENTOS_L', 'edit'), processDocumentLPayment);


export default router;
