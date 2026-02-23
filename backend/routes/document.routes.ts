
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, updateStatus, getInvoices, deleteDocument, resendInventoryNotification, processDocumentLPayment } from '../controllers/document.controller.js';

const router = Router();

router.get('/', getDocuments);
router.post('/bulk', bulkCreateDocuments);
router.patch('/status/:id', updateStatus);
router.delete('/:id', deleteDocument);
router.post('/sync-inventory', syncInventory);
router.post('/resend-notification', resendInventoryNotification);
router.get('/invoices', getInvoices);
router.post('/process-l-payment', processDocumentLPayment);

export default router;
