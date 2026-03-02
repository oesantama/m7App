import { Router } from 'express';
import { login, logout, forgotPassword } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);

export default router;
