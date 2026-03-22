
import { Router } from 'express';
import {
    initDispatch,
    signDispatchPending,
    getPendingSignaturesForUser,
    confirmDelivery,
    getDeliveryHistory,
    getReturnHistory,
    uploadVoucher,
    getVouchers,
    getVoucherFile,
    getPendingReturns,
    updateReturnStatus,
} from '../controllers/dispatch.controller.js';

const router = Router();

// Despacho desde bodega
router.post('/init', initDispatch);
router.post('/sign-pending', signDispatchPending);
router.get('/pending-signatures/:userId', getPendingSignaturesForUser);

// Entrega al cliente
router.post('/confirm-delivery', confirmDelivery);
router.get('/delivery-history', getDeliveryHistory);
router.get('/return-history', getReturnHistory);

// Soportes de pago
router.post('/voucher', uploadVoucher);
router.get('/vouchers/:invoiceId', getVouchers);
router.get('/voucher-file/:id', getVoucherFile);

// Control de devoluciones (bodega)
router.get('/returns-pending', getPendingReturns);
router.put('/returns/:id/status', updateReturnStatus);

export default router;
