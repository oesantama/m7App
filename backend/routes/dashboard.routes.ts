
import { Router } from 'express';
import { getDashboardStats, getDemandPrediction, getAjoverStats } from '../controllers/dashboard.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

router.get('/stats', requirePermission('DASHBOARD', 'view'), getDashboardStats);
router.get('/prediction', requirePermission('DASHBOARD', 'view'), getDemandPrediction);
router.get('/ajover-stats', requirePermission('PAG-35', 'view'), getAjoverStats);


export default router;
