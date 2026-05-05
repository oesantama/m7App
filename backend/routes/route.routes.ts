
import { Router } from 'express';
import { getRoutes, saveRoute, logRouteMovement, getRoutingPatterns, getDeliveryPatterns, updateLocation, getLatestLocations, learnFromCompletedRoute, geocodeAddress, getRoadRoute, getRoadMatrix, reassignRouteVehicle, unassignRouteInvoice, repiceRouteInvoice, getRouteInvoices, getDailyKPIs, failAndReassignInvoice, learnFromFailure, resolveCustomerCoords } from '../controllers/route.controller.js';

const router = Router();

router.get('/', getRoutes);
router.get('/kpis', getDailyKPIs);
router.get('/patterns', getRoutingPatterns);
router.get('/delivery-patterns', getDeliveryPatterns);
router.post('/', saveRoute);
router.post('/log', logRouteMovement);
router.post('/location', updateLocation);
router.get('/locations', getLatestLocations);
router.post('/learn', learnFromCompletedRoute);
router.post('/geocode', geocodeAddress);
router.post('/road-route', getRoadRoute);
router.post('/road-matrix', getRoadMatrix);
router.post('/reassign-vehicle',   reassignRouteVehicle);
router.post('/unassign-invoice',   unassignRouteInvoice);
router.post('/repice-invoice',     repiceRouteInvoice);
router.post('/fail-invoice',       failAndReassignInvoice);
router.post('/learn-failure',      learnFromFailure);
router.post('/resolve-coords',     resolveCustomerCoords);
router.get('/:routeId/invoices',   getRouteInvoices);

export default router;
