
import { Router } from 'express';
import {
    initDispatch,
    signDispatchPending,
    getPendingSignaturesForUser,
    getInvoicePendingSignatures,
    confirmDelivery,
    getDeliveryHistory,
    getReturnHistory,
    uploadVoucher,
    getVouchers,
    getVoucherFile,
    getPendingReturns,
    updateReturnStatus,
    confirmBodegaReturn,
    getPendingBodegaReturns,
    getRouteActivePlates,
    getRoutePlateInvoices,
    registerRouteReturn,
    getApprovalPendingReturns,
    createApprovalBatch,
    getApprovalBatches,
    getApprovalBatchByCode,
    getUnifiedHistory,
    getHistoryFiltersData,
    sendApprovalBatchEmail,
    getPublicReturnApproval,
    confirmPublicReturnApproval,
    getInvoiceReturnData,
    getBodegaReturnsHistory,
    confirmReturnConciliation,
    confirmReturnFacturacion,
    confirmDocReceived,
    getReturnsForInvoice,
    getReturnsTracking,
    advanceReturnState,
    markExcelDownloaded,
    getConciliacionPending,
    importFromConciliacion,
    getReturnReasons,
    createReturnReason,
} from '../controllers/dispatch.controller.js';

const router = Router();

// Despacho desde bodega
router.post('/init', initDispatch);
router.post('/sign-pending', signDispatchPending);
router.get('/pending-signatures/:userId', getPendingSignaturesForUser);
router.get('/invoice-pending-signatures/:invoiceId', getInvoicePendingSignatures);

// Entrega al cliente
router.post('/confirm-delivery', confirmDelivery);
router.get('/delivery-history', getDeliveryHistory);
router.get('/return-history', getReturnHistory);
router.get('/unified-history', getUnifiedHistory);
router.get('/history-filters-data', getHistoryFiltersData);

// Soportes de pago
router.post('/voucher', uploadVoucher);
router.get('/vouchers/:invoiceId', getVouchers);
router.get('/voucher-file/:id', getVoucherFile);

// Control de devoluciones de ruta (bodega confirma recepción de conductor)
router.get('/returns-pending', getPendingReturns);
router.put('/returns/:id/status', updateReturnStatus);

// Devoluciones post-legalización (bodega confirma mercancía de conciliación DEVOLUCION)
router.get('/pending-bodega-returns', getPendingBodegaReturns);
router.post('/bodega-receipt', confirmBodegaReturn);

// Devoluciones desde ruta — flujo iniciado en bodega
router.get('/route-active-plates',       getRouteActivePlates);
router.get('/route-plate-invoices/:plate', getRoutePlateInvoices);
router.post('/register-route-return',    registerRouteReturn);

// Lotes de aprobación de devoluciones
router.get('/approval-pending',                         getApprovalPendingReturns);
router.post('/approval-batches',                        createApprovalBatch);
router.get('/approval-batches',                         getApprovalBatches);
router.get('/approval-batch/:batchCode',                getApprovalBatchByCode);
router.post('/approval-batches/:id/send-email',         sendApprovalBatchEmail);
router.post('/delivery-returns/:id/confirm-facturacion', confirmReturnFacturacion);
router.post('/approval-batches/:id/confirm-doc-received', confirmDocReceived);

// Motivos de devolución (maestra)
router.get('/return-reasons',  getReturnReasons);
router.post('/return-reasons', createReturnReason);

// Pipeline tracking de devoluciones bodega (rutas literales primero, luego parametrizadas)
router.get('/delivery-returns/tracking',                    getReturnsTracking);
router.get('/delivery-returns/conciliacion-pending',        getConciliacionPending);
router.post('/delivery-returns/import-from-conciliacion',   importFromConciliacion);
router.put('/delivery-returns/:id/advance',                 advanceReturnState);
router.put('/delivery-returns/:id/mark-excel',              markExcelDownloaded);

// Recepcion bodega / historial / conciliacion
router.get('/returns-for-invoice/:invoiceId',     getReturnsForInvoice);
router.get('/invoice-return-data/:invoiceNumber', getInvoiceReturnData);
router.get('/bodega-returns-history',             getBodegaReturnsHistory);
router.post('/returns/:id/confirm-conciliation',  confirmReturnConciliation);

// Rutas públicas (sin JWT) — accesibles vía /api/dispatch/public/...
router.get('/public/return-approval/:batchCode/:token',         getPublicReturnApproval);
router.post('/public/return-approval/:batchCode/:token/confirm', confirmPublicReturnApproval);

export default router;
