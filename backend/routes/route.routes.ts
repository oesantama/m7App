
import { Router } from 'express';
import { getRoutes, saveRoute, logRouteMovement } from '../controllers/route.controller.js';

const router = Router();

router.get('/', getRoutes);
router.post('/', saveRoute);
router.post('/log', logRouteMovement);

export default router;
