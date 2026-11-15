
import { Router } from 'express';
import { handleRestoreSystem } from '../controllers/system.controller.js';
import { requirePermission, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { getDiagnostico, enviarCorreoPrueba } from '../controllers/diagnostico.controller.js';


const router = Router();

router.post('/restore', requirePermission('SISTEMA', 'edit'), handleRestoreSystem);
router.get('/diagnostico', requireSuperAdmin, getDiagnostico);
router.post('/diagnostico/correo-prueba', requireSuperAdmin, enviarCorreoPrueba);


export default router;
