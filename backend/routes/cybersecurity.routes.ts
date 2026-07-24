import { Router } from 'express';
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign, sendCampaign, getCampaignStats, trackPhishingEvent, getTrainingPlans, createTrainingPlan, getGlobalMetrics } from '../controllers/cybersecurity.controller.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';

const router = Router();
const upload = multer({ dest: path.join(process.cwd(), 'backend', 'uploads') });

// Phishing & Metrics Routes
router.get('/metrics', authenticateToken, getGlobalMetrics);
router.get('/phishing/campaigns', authenticateToken, requireSuperAdmin, getCampaigns);
router.post('/phishing/campaigns', authenticateToken, requireSuperAdmin, createCampaign);
router.put('/phishing/campaigns/:id', authenticateToken, requireSuperAdmin, updateCampaign);
router.delete('/phishing/campaigns/:id', authenticateToken, requireSuperAdmin, deleteCampaign);
router.post('/phishing/campaigns/:id/send', authenticateToken, requireSuperAdmin, sendCampaign);
router.get('/phishing/campaigns/:id/stats', authenticateToken, requireSuperAdmin, getCampaignStats);

// Tracking pixel/click (no auth needed so users can trigger it from their email)
router.get('/track/:campaignId/:userEmail/:eventType', trackPhishingEvent);

// Training Routes
router.get('/training/plans', authenticateToken, getTrainingPlans);
router.post('/training/plans', authenticateToken, upload.single('file'), createTrainingPlan);

export default router;
