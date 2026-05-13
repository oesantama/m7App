
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
router.get('/approval-pending',          getApprovalPendingReturns);
router.post('/approval-batches',         createApprovalBatch);
router.get('/approval-batches',          getApprovalBatches);
router.get('/approval-batch/:batchCode', getApprovalBatchByCode);

export default router;
