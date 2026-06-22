import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/chat', requirePermission('AI_CHAT', 'view'), aiController.chat);
router.post('/learn', requirePermission('AI_CHAT', 'edit'), aiController.learn);
router.get('/orchestrator/dashboard', requirePermission('AI_CHAT', 'view'), aiController.getOrchestratorDashboard);

export default router;
