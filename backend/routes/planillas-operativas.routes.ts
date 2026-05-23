import express from 'express';
import { getRecords, saveRecords, removeRecord, clearRecords, checkFiles, checkHistory, getRedespachos, forceSync } from '../controllers/planillas-operativas.controller.js';

const router = express.Router();

router.get('/', getRecords);
router.get('/redespachos', getRedespachos);
router.post('/', saveRecords);
router.post('/check-files', checkFiles);
router.post('/check-history', checkHistory);
router.delete('/', clearRecords);
router.delete('/:id', removeRecord);
router.all('/force-sync', forceSync);

export default router;
