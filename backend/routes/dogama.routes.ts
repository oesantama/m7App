import { Router } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware.js';
import * as dogama from '../controllers/dogama.controller.js';

const router = Router();

// ── OAuth callback: NO auth required (viene de Google/Microsoft) ──────────────
router.get('/email-config/callback', dogama.handleOAuthCallback);

router.use(authenticateToken);

// ── Confeccionistas ────────────────────────────────────────────────────────────
router.get('/confeccionistas', requirePermission('MAESTRAS_DOGAMA', 'view'), dogama.getConfeccionistas);
router.post('/confeccionistas', requirePermission('MAESTRAS_DOGAMA', 'create'), dogama.createConfeccionista);
router.post('/confeccionistas/bulk', requirePermission('MAESTRAS_DOGAMA', 'create'), dogama.bulkCreateConfeccionistas);
router.post('/confeccionistas/resolve-ciudad', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.resolveCiudadBulk);
router.put('/confeccionistas/:id', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.updateConfeccionista);
router.delete('/confeccionistas/:id', requirePermission('MAESTRAS_DOGAMA', 'delete'), dogama.deleteConfeccionista);

// ── Catálogos genéricos (marcas + tipos_prenda) ────────────────────────────────
router.get('/catalog/:table', requirePermission('MAESTRAS_DOGAMA', 'view'), dogama.getCatalog);
router.post('/catalog/:table', requirePermission('MAESTRAS_DOGAMA', 'create'), dogama.createCatalogItem);
router.post('/catalog/:table/bulk', requirePermission('MAESTRAS_DOGAMA', 'create'), dogama.bulkCreateCatalog);
router.put('/catalog/:table/:id', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.updateCatalogItem);
router.delete('/catalog/:table/:id', requirePermission('MAESTRAS_DOGAMA', 'delete'), dogama.deleteCatalogItem);

// ── Email OAuth Config ─────────────────────────────────────────────────────────
router.get('/email-config', requirePermission('MAESTRAS_DOGAMA', 'view'), dogama.getEmailConfig);
router.get('/email-config/gmail/init', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.initGmailAuth);
router.get('/email-config/outlook/init', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.initOutlookAuth);
router.delete('/email-config/:provider', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.deleteEmailConfig);
router.post('/email-config/:provider/test', requirePermission('MAESTRAS_DOGAMA', 'edit'), dogama.testEmailSend);

// ── Despachos ─────────────────────────────────────────────────────────────────
router.get('/despachos', requirePermission('CITAS_DESPACHO_CARGA', 'view'), dogama.getDespachos);
router.post('/despachos/bulk', requirePermission('CITAS_DESPACHO_CARGA', 'create'), dogama.bulkCreateDespachos);
router.put('/despachos/:id/estado', requirePermission('CITAS_DESPACHO_CARGA', 'edit'), dogama.updateDespachoEstado);
router.delete('/despachos/:id', requirePermission('CITAS_DESPACHO_CARGA', 'delete'), dogama.deleteDespacho);

// ── Citas / Recogidas ─────────────────────────────────────────────────────────
router.get('/citas', requirePermission('CITAS_DESPACHO_CARGA', 'view'), dogama.getCitasRecogidas);
router.post('/citas/bulk', requirePermission('CITAS_DESPACHO_CARGA', 'create'), dogama.bulkCreateCitas);
router.put('/citas/:id/estado', requirePermission('CITAS_DESPACHO_CARGA', 'edit'), dogama.updateCitaEstado);
router.patch('/citas/:id', requirePermission('CITAS_DESPACHO_CARGA', 'edit'), dogama.patchCita);
router.delete('/citas/:id', requirePermission('CITAS_DESPACHO_CARGA', 'delete'), dogama.deleteCita);

// ── Asignaciones activas de flota ─────────────────────────────────────────────
router.get('/fleet-assignments', requirePermission('CITAS_DESPACHO_CARGA', 'view'), dogama.getActiveFleetAssignments);

// ── Planillas Historial ───────────────────────────────────────────────────────
router.get('/planillas',  requirePermission('CITAS_DESPACHO_CARGA', 'view'),   dogama.getPlanillasHistorial);
router.post('/planillas', requirePermission('CITAS_DESPACHO_CARGA', 'create'), dogama.createPlanillaHistorial);

export default router;
