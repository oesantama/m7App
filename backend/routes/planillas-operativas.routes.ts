import express from 'express';
import multer from 'multer';
import { getRecords, saveRecords, removeRecord, clearRecords, checkFiles, checkHistory, getRedespachos, forceSync, updateRecord, analyzePdf } from '../controllers/planillas-operativas.controller.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.get('/', getRecords);
router.get('/redespachos', getRedespachos);
router.post('/', saveRecords);
router.post('/check-files', checkFiles);
router.post('/check-history', checkHistory);
router.delete('/', clearRecords);
router.delete('/:id', removeRecord);
router.put('/:id', updateRecord);
router.all('/force-sync', forceSync);
router.post('/analyze-pdf', upload.single('file'), analyzePdf);

export default router;
