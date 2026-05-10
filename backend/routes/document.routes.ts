
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, createManualDocument, updateStatus, getInvoices, deleteDocument, resendInventoryNotification, processDocumentLPayment, getInventoryLog, getMastersuiteReport, parsePdfRemisiones, updateConsolidatedCount2, updateItemInvoice, getInvoiceTraceability, getConciliationHistory, uploadCumplido, getDocumentStats, correctDocumentItems, renameCumplido, deleteCumplido, driveExplorer, generateDriveLink } from '../controllers/document.controller.js';
import multer from 'multer';

import { requirePermission, authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// PAG-13 = DESPACHO LOGÍSTICO (conductores)
// PAG-15 = PLANIFICADOR DE RUTAS
// PAG-16 = GESTIÓN DE DOCUMENTOS
// PAG-17 = RECIBIDO DE MATERIAL
// PAG-30 = RECIBIDO MANUAL
const DOCS_VIEW_PAGES = ['PAG-13', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-30'];
const hasDocsView = (user: any) =>
  user?.roleId === 'ROL-01' || user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com' ||
  user?.permissions?.some((p: any) => DOCS_VIEW_PAGES.includes(p.module) && p.actions.includes('view'));

// Middleware para edición de auditoría (PAG-16, PAG-17, PAG-30)
const requireAuditEdit = (req: any, res: any, next: any) => {
  const user = req.user;
  const isSuper = user?.roleId === 'ROL-01' || user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-16', 'PAG-17', 'PAG-30'].includes(p.module) &&
    (p.actions.includes('edit') || p.actions.includes('create'))
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente. Se requiere acceso de edición a documentos.' });
};

router.get('/', (req, res, next) => {
  if (hasDocsView((req as any).user)) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver documentos' });
}, getDocuments);

router.post('/bulk', requirePermission('DOCUMENTOS_L', 'create'), bulkCreateDocuments);
router.post('/manual', requirePermission('PAG-30', 'create'), createManualDocument);
router.patch('/status/:id', requireAuditEdit, updateStatus);
router.delete('/:id', requirePermission('DOCUMENTOS_L', 'delete'), deleteDocument);
router.post('/sync-inventory', requireAuditEdit, syncInventory);
router.post('/resend-notification', requireAuditEdit, resendInventoryNotification);

// Log de Existencias
router.get('/inventory-log', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.roleId === 'ROL-01' || user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-16', 'PAG-17', 'PAG-01'].includes(p.module) && p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver existencias' });
}, getInventoryLog);

router.get('/invoices', (req, res, next) => {
  if (hasDocsView((req as any).user)) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver facturas' });
}, getInvoices);

router.post('/payments-l', requirePermission('DOCUMENTOS_L', 'edit'), processDocumentLPayment);

router.get('/mastersuite-report', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.roleId === 'ROL-01' || user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-34', 'PAG-16', 'PAG-15'].includes(p.module) && p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente' });
}, getMastersuiteReport);

router.post('/parse-pdf', authenticateToken, upload.single('file'), parsePdfRemisiones);
router.patch('/consolidated-count2', requireAuditEdit, updateConsolidatedCount2);
router.patch('/items/invoice', requireAuditEdit, updateItemInvoice);
router.get('/conciliations/:docId/:articleId', requireAuditEdit, getConciliationHistory);

router.get('/invoice-traceability', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.roleId === 'ROL-01' || user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) =>
    ['PAG-13', 'PAG-16', 'PAG-15', 'PAG-17', 'PAG-30', 'PAG-01'].includes(p.module) && p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente' });
}, getInvoiceTraceability);

// Gestión Documental de Cumplidos (Drive) — PAG-45 / MOD-10
router.post('/upload-cumplido', authenticateToken, upload.array('files', 10), uploadCumplido);
router.get('/stats', authenticateToken, getDocumentStats);
router.get('/drive-explorer', authenticateToken, driveExplorer);
router.post('/drive-link', authenticateToken, generateDriveLink);
router.put('/cumplido/:id/rename', authenticateToken, renameCumplido);
router.delete('/cumplido/:id/delete', authenticateToken, deleteCumplido);

// Corrección masiva de ítems desde archivo (solo edición, no inserción)
router.post('/correct-items', requireAuditEdit, correctDocumentItems);

export default router;
