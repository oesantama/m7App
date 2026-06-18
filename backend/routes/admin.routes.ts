import { Router } from 'express';
import { getTables, getTableData, saveRecord, deleteRecord, executeSql, getTableSchema, bulkDeleteRecords, runCron, getCronLogs, getPendingDriveCount } from '../controllers/admin.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Blindaje de Seguridad Global para Administración
router.use(authenticateToken);

router.post('/tables', getTables);
router.post('/data', getTableData);
router.post('/sql', executeSql);
router.post('/save', saveRecord);
router.post('/delete', deleteRecord);
router.post('/bulk-delete', bulkDeleteRecords);
router.post('/schema', getTableSchema); // New schema route
router.post('/cron/run', runCron); // New cron runner route
router.get('/cron/logs', getCronLogs); // Live cron logs
router.get('/cron/pending-drive', getPendingDriveCount);

export default router;
