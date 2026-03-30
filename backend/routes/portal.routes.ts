import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { clientLogin, trackOrder, getClientOrders } from '../controllers/portal.controller.js';

const router = Router();

// Rutas públicas del portal
router.post('/login', clientLogin);
router.get('/tracking/:trackingId', trackOrder);

// Protegida — requiere token de sesión interno
router.get('/orders', authenticateToken, getClientOrders);

export default router;
