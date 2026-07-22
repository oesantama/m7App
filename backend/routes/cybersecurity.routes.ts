import { Router } from 'express';
import { getCampaigns, createCampaign, sendCampaign, getCampaignStats, trackPhishingEvent, getTrainingPlans, createTrainingPlan } from '../controllers/cybersecurity.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';

const router = Router();
const upload = multer({ dest: path.join(process.cwd(), 'backend', 'uploads') });

// Phishing Routes
router.get('/phishing/campaigns', authenticateToken, getCampaigns);
router.post('/phishing/campaigns', authenticateToken, createCampaign);
router.post('/phishing/campaigns/:id/send', authenticateToken, sendCampaign);
router.get('/phishing/campaigns/:id/stats', authenticateToken, getCampaignStats);

// Tracking pixel/click (no auth needed so users can trigger it from their email)
router.get('/track/:campaignId/:userEmail/:eventType', trackPhishingEvent);

// Training Routes
router.get('/training/plans', authenticateToken, getTrainingPlans);
router.post('/training/plans', authenticateToken, upload.single('file'), createTrainingPlan);

export default router;
