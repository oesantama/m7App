
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

export default router;
