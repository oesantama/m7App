import { Router } from 'express';
import { getSyncStatus, getSyncHistory, triggerSync, chat, downloadReport, uploadAndValidate } from '../controllers/basc.controller.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Define BASC endpoints with specific page permissions
router.get('/sync/status', requirePermission('PAG-71', 'view'), getSyncStatus);
router.get('/sync/history', requirePermission('PAG-71', 'view'), getSyncHistory);
router.post('/sync/trigger', requirePermission('PAG-71', 'edit'), triggerSync);
router.post('/chat', requirePermission('PAG-72', 'view'), upload.any(), chat);
router.get('/reports/download', requirePermission('PAG-73', 'view'), downloadReport);
router.post('/upload', requirePermission('PAG-71', 'edit'), upload.any(), uploadAndValidate);

export default router;
