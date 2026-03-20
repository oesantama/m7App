
import { Router } from 'express';
import { getRoutes, saveRoute, logRouteMovement, getRoutingPatterns, updateLocation, getLatestLocations, learnFromCompletedRoute } from '../controllers/route.controller.js';

const router = Router();

router.get('/', getRoutes);
router.get('/patterns', getRoutingPatterns);
router.post('/', saveRoute);
router.post('/log', logRouteMovement);
router.post('/location', updateLocation);
router.get('/locations', getLatestLocations);
router.post('/learn', learnFromCompletedRoute);

export default router;
