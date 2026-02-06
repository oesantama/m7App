
import { Router } from 'express';
import { getDocuments, syncInventory, bulkCreateDocuments, updateStatus, getInvoices, deleteDocument } from '../controllers/document.controller.js';

const router = Router();

router.get('/', getDocuments);
router.post('/bulk', bulkCreateDocuments);
router.patch('/status/:id', updateStatus);
router.delete('/:id', deleteDocument);
router.post('/sync-inventory', syncInventory);
router.get('/invoices', getInvoices);

export default router;
