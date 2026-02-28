
import { Router } from 'express';
import { getDashboardStats, getDemandPrediction } from '../controllers/dashboard.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

router.get('/stats', requirePermission('DASHBOARD', 'view'), getDashboardStats);
router.get('/prediction', requirePermission('DASHBOARD', 'view'), getDemandPrediction);


export default router;
