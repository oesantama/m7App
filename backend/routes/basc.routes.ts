import { Router } from 'express';
import { getSyncStatus, getSyncHistory, triggerSync, chat, downloadReport, uploadAndValidate } from '../controllers/basc.controller.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Define BASC endpoints with specific page permissions
router.get('/sync/status', requirePermission('PAG-BASC-02', 'view'), getSyncStatus);
router.get('/sync/history', requirePermission('PAG-BASC-02', 'view'), getSyncHistory);
router.post('/sync/trigger', requirePermission('PAG-BASC-02', 'edit'), triggerSync);
router.post('/chat', requirePermission('PAG-BASC-03', 'view'), upload.any(), chat);
router.get('/reports/download', requirePermission('PAG-BASC-04', 'view'), downloadReport);
router.post('/upload', requirePermission('PAG-BASC-02', 'edit'), upload.any(), uploadAndValidate);

export default router;
