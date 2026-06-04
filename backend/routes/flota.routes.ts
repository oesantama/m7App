import { Router } from 'express';
import {
    getFlotaReport,
    getManualEntries, saveManualEntry, deleteManualEntry,
    uploadTdmManifiestos, getTdmManifiestos, deleteTdmManifiesto,
} from '../controllers/flota.controller.js';

const router = Router();

router.get('/report', getFlotaReport);
router.get('/manual-entries', getManualEntries);
router.post('/manual-entries', saveManualEntry);
router.delete('/manual-entries/:id', deleteManualEntry);

// TDM manifiestos (carga Excel)
router.post('/tdm/upload', uploadTdmManifiestos);
router.get('/tdm/manifiestos', getTdmManifiestos);
router.delete('/tdm/manifiestos/:id', deleteTdmManifiesto);

export default router;
