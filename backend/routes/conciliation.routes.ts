
import { Router } from 'express';
import multer from 'multer';
import {
    getPendingConciliations,
    getPendingPlanNormal,
    getConciliationByDocument,
    getConciliationHistory,
    downloadPlanilla,
    searchRoutesForPlanilla,
    saveConciliation,
    saveSobrecostos,
    saveRouteGroupPayments,
    generateAndSendReport,
    importMasterSuite,
    getInvoiceStatusHistory,
    closeConciliationCycle,
    updatePaymentMethod,
    updateRemesaTDM,
    reverseConciliation,
    getPlateMovementHistory,
    checkReferenceExists,
    updateInvoiceValue,
} from '../controllers/conciliation.controller.js';

const router = Router();

const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/pending',                    getPendingConciliations);
router.get('/pending-normal',             getPendingPlanNormal);
router.get('/search-routes',              searchRoutesForPlanilla);
router.get('/history',                    getConciliationHistory);
router.get('/plate-history',              getPlateMovementHistory);
router.get('/check-reference/:reference', checkReferenceExists);
router.get('/planilla',                   downloadPlanilla);
router.get('/:documentId/history',        getInvoiceStatusHistory);
router.get('/:documentId',                getConciliationByDocument);
router.post('/save',                      saveConciliation);
router.post('/sobrecostos',               saveSobrecostos);
router.post('/group-payments',            saveRouteGroupPayments);
router.post('/report',                    generateAndSendReport);
router.post('/import-mastersuite',        upload.single('file'), importMasterSuite);
router.post('/close-cycle',               closeConciliationCycle);
router.post('/update-payment-method',    updatePaymentMethod);
router.post('/update-remesa-tdm',         updateRemesaTDM);
router.post('/reverse',                   reverseConciliation);
router.patch('/invoice-value',            updateInvoiceValue);

export default router;
