import { Router } from 'express';
import { clientLogin, trackOrder, getClientOrders } from '../controllers/portal.controller.js';
// import { verifyToken } from '../middleware/auth.middleware.js'; // Unused

const router = Router();

// Public
router.post('/login', clientLogin);
router.get('/tracking/:trackingId', trackOrder);

// Protected (Client Token) - Mocked protection for prototype
router.get('/orders', getClientOrders);

export default router;
