import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/chat', authenticateToken, aiController.chat);
router.post('/analyze', authenticateToken, aiController.analyze);
router.post('/learn', requireSuperAdmin, aiController.learn);
router.get('/orchestrator/dashboard', requireSuperAdmin, aiController.getOrchestratorDashboard);

export default router;
