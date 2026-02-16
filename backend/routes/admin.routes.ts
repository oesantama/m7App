import { Router } from 'express';
import { getTables, getTableData, saveRecord, deleteRecord, executeSql, getTableSchema, bulkDeleteRecords } from '../controllers/admin.controller.js';

const router = Router();

router.post('/tables', getTables);
router.post('/data', getTableData);
router.post('/sql', executeSql);
router.post('/save', saveRecord);
router.post('/delete', deleteRecord);
router.post('/bulk-delete', bulkDeleteRecords);
router.post('/schema', getTableSchema); // New schema route

export default router;
