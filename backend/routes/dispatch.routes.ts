
import { Router } from 'express';
import {
    initDispatch,
    signDispatchPending,
    getPendingSignaturesForUser,
    confirmDelivery,
    getDeliveryHistory,
    getReturnHistory,
} from '../controllers/dispatch.controller.js';

const router = Router();

// Despacho desde bodega (flujo existente)
router.post('/init', initDispatch);
router.post('/sign-pending', signDispatchPending);
router.get('/pending-signatures/:userId', getPendingSignaturesForUser);

// Entrega al cliente (nuevo flujo)
router.post('/confirm-delivery', confirmDelivery);
router.get('/delivery-history', getDeliveryHistory);
router.get('/return-history', getReturnHistory);

export default router;
