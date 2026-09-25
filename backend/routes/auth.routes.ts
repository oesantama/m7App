import { Router } from 'express';
import { login, logout, forgotPassword, validateSession } from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.get('/validate-session', authenticateToken, validateSession);

export default router;
