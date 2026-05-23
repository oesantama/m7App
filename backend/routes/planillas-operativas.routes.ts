import express from 'express';
import { getRecords, saveRecords, removeRecord, clearRecords, checkFiles } from '../controllers/planillas-operativas.controller.js';

const router = express.Router();

router.get('/', getRecords);
router.post('/', saveRecords);
router.post('/check-files', checkFiles);   // ← Verifica existencia en BD
router.delete('/', clearRecords);
router.delete('/:id', removeRecord);

export default router;
