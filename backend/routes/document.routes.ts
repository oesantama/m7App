
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, updateStatus, getInvoices, deleteDocument, resendInventoryNotification, processDocumentLPayment } from '../controllers/document.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission('DOCUMENTOS_L', 'view'), getDocuments);
router.post('/bulk', requirePermission('DOCUMENTOS_L', 'create'), bulkCreateDocuments);
router.patch('/status/:id', requirePermission('DOCUMENTOS_L', 'edit'), updateStatus);
router.delete('/:id', requirePermission('DOCUMENTOS_L', 'delete'), deleteDocument);
router.post('/sync-inventory', requirePermission('DOCUMENTOS_L', 'edit'), syncInventory);
router.post('/resend-notification', requirePermission('DOCUMENTOS_L', 'edit'), resendInventoryNotification);
router.get('/invoices', requirePermission('DOCUMENTOS_L', 'view'), getInvoices);
router.post('/process-l-payment', requirePermission('DOCUMENTOS_L', 'edit'), processDocumentLPayment);


export default router;
