import { Router } from 'express';
import { getSyncStatus, getSyncHistory, triggerSync, chat, downloadReport } from '../controllers/basc.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

// Define BASC endpoints with specific page permissions
router.get('/sync/status', requirePermission('PAG-BASC-02', 'view'), getSyncStatus);
router.get('/sync/history', requirePermission('PAG-BASC-02', 'view'), getSyncHistory);
router.post('/sync/trigger', requirePermission('PAG-BASC-02', 'edit'), triggerSync);
router.post('/chat', requirePermission('PAG-BASC-03', 'view'), chat);
router.get('/reports/download', requirePermission('PAG-BASC-04', 'view'), downloadReport);

export default router;
