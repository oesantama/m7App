
import { Router } from 'express';
import multer from 'multer';
import {
    getPendingConciliations,
    getConciliationByDocument,
    getConciliationHistory,
    downloadPlanilla,
    searchRoutesForPlanilla,
    saveConciliation,
    saveSobrecostos,
    generateAndSendReport,
    importMasterSuite,
    getInvoiceStatusHistory,
} from '../controllers/conciliation.controller.js';

const router = Router();

const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/pending',                    getPendingConciliations);
router.get('/search-routes',              searchRoutesForPlanilla);
router.get('/history',                    getConciliationHistory);
router.get('/planilla',                   downloadPlanilla);
router.get('/:documentId/history',        getInvoiceStatusHistory);
router.get('/:documentId',                getConciliationByDocument);
router.post('/save',                      saveConciliation);
router.post('/sobrecostos',               saveSobrecostos);
router.post('/report',                    generateAndSendReport);
router.post('/import-mastersuite',        upload.single('file'), importMasterSuite);

export default router;
