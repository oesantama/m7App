import { Router } from 'express';
import { geocodeAddress } from '../controllers/geocode.controller.js';

const router = Router();

// GET /api/geocode?address=...&city=...&notes=...
router.get('/', geocodeAddress);

export default router;
