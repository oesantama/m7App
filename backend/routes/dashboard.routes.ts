
import { Router } from 'express';
import { getDashboardStats, getDemandPrediction } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/stats', getDashboardStats);
router.get('/prediction', getDemandPrediction);

export default router;
