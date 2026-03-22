
import { Router } from 'express';
import { getRoutes, saveRoute, logRouteMovement, getRoutingPatterns, updateLocation, getLatestLocations, learnFromCompletedRoute, geocodeAddress, getRoadRoute } from '../controllers/route.controller.js';

const router = Router();

router.get('/', getRoutes);
router.get('/patterns', getRoutingPatterns);
router.post('/', saveRoute);
router.post('/log', logRouteMovement);
router.post('/location', updateLocation);
router.get('/locations', getLatestLocations);
router.post('/learn', learnFromCompletedRoute);
router.post('/geocode', geocodeAddress);
router.post('/road-route', getRoadRoute);

export default router;
