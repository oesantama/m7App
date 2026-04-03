
import { Router } from 'express';
import {
    getPendingConciliations,
    getConciliationByDocument,
    saveConciliation,
    generateAndSendReport,
} from '../controllers/conciliation.controller.js';

const router = Router();

router.get('/pending',         getPendingConciliations);
router.get('/:documentId',     getConciliationByDocument);
router.post('/save',           saveConciliation);
router.post('/report',         generateAndSendReport);

export default router;
