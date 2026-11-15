import { Router } from 'express';
import { login, logout, forgotPassword, resetPassword, validateSession, renewToken } from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/validate-session', authenticateToken, validateSession);
router.post('/renew-token', authenticateToken, renewToken);

export default router;

