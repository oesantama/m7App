
import { Router } from 'express';
import { getDashboardStats, getDemandPrediction, getAjoverStats, getGerenciaDashboard } from '../controllers/dashboard.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

router.get('/stats', requirePermission('DASHBOARD', 'view'), getDashboardStats);
router.get('/prediction', requirePermission('DASHBOARD', 'view'), getDemandPrediction);
router.get('/ajover-stats', requirePermission('PAG-35', 'view'), getAjoverStats);
router.get('/gerencia', requirePermission('DASHBOARD', 'view'), getGerenciaDashboard);


export default router;
