import { Router } from 'express';
import * as trainingController from '../controllers/training.controller.js';
import { requirePermission, authenticateToken } from '../middleware/auth.middleware.js';


const router = Router();

// Rutas Públicas/Usuario (Protegidas por JWT)
router.get('/categories', requirePermission('CAPACITACIONES', 'view'), trainingController.getCategories);
router.get('/courses', requirePermission('CAPACITACIONES', 'view'), trainingController.getCourses);
router.get('/courses/:id', requirePermission('CAPACITACIONES', 'view'), trainingController.getCourseWithLessons);
router.post('/progress', requirePermission('CAPACITACIONES', 'edit'), trainingController.updateProgress);

// Rutas de Sesiones y Asistencias (Admin)
router.get('/sessions', requirePermission('CAPACITACIONES', 'view'), trainingController.getSessions);
router.post('/sessions', requirePermission('CAPACITACIONES', 'create'), trainingController.saveSession);
router.get('/sessions/:id/attendance', requirePermission('CAPACITACIONES', 'view'), trainingController.getSessionAttendance);
router.patch('/sessions/:id/extend', requirePermission('CAPACITACIONES', 'edit'), trainingController.extendSession);

// Rutas Públicas (Sin requirePermission/Bypass JWT en server.ts)
router.get('/public/session/:token', trainingController.getPublicSession);
router.post('/public/attendance', trainingController.registerPublicAttendance);

// PDF + Drive de asistencia por sesión
router.get('/sessions/:id/pdf',          requirePermission('CAPACITACIONES', 'view'),   trainingController.downloadSessionPDF);
router.post('/sessions/:id/upload-drive', requirePermission('CAPACITACIONES', 'edit'),  trainingController.uploadSessionPDFToDrive);
router.post('/sessions/migrate-all',      requirePermission('CAPACITACIONES', 'edit'),  trainingController.migrateAllSessionsPDF);

// Existentes
router.post('/courses', requirePermission('CAPACITACIONES', 'create'), trainingController.saveCourse);
router.post('/lessons', requirePermission('CAPACITACIONES', 'create'), trainingController.saveLesson);


export default router;
