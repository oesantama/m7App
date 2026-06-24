import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { lookupCities } from '../controllers/geo.controller.js';

const router = Router();
router.post('/lookup-cities', authenticateToken, lookupCities);
export default router;
