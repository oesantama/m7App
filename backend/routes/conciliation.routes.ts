
import { Router } from 'express';
import {
    getPendingConciliations,
    getConciliationByDocument,
    getConciliationHistory,
    downloadPlanilla,
    saveConciliation,
    generateAndSendReport,
} from '../controllers/conciliation.controller.js';

const router = Router();

router.get('/pending',         getPendingConciliations);
router.get('/history',         getConciliationHistory);
router.get('/planilla',        downloadPlanilla);
router.get('/:documentId',     getConciliationByDocument);
router.post('/save',           saveConciliation);
router.post('/report',         generateAndSendReport);

export default router;
