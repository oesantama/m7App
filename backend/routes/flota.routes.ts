import { Router } from 'express';
import { getFlotaReport, getManualEntries, saveManualEntry, deleteManualEntry } from '../controllers/flota.controller.js';

const router = Router();

router.get('/report', getFlotaReport);
router.get('/manual-entries', getManualEntries);
router.post('/manual-entries', saveManualEntry);
router.delete('/manual-entries/:id', deleteManualEntry);

export default router;
