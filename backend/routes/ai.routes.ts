
import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';

const router = Router();

router.post('/chat', aiController.chat);
router.post('/learn', aiController.learn);

export default router;
