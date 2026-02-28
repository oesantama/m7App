import { Router } from 'express';
import * as trainingController from '../controllers/training.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';


const router = Router();

// Rutas Públicas/Usuario (Protegidas por JWT)
router.get('/categories', requirePermission('CAPACITACIONES', 'view'), trainingController.getCategories);
router.get('/courses', requirePermission('CAPACITACIONES', 'view'), trainingController.getCourses);
router.get('/courses/:id', requirePermission('CAPACITACIONES', 'view'), trainingController.getCourseWithLessons);
router.post('/progress', requirePermission('CAPACITACIONES', 'edit'), trainingController.updateProgress);

// Rutas Admin
router.post('/courses', requirePermission('CAPACITACIONES', 'create'), trainingController.saveCourse);
router.post('/lessons', requirePermission('CAPACITACIONES', 'create'), trainingController.saveLesson);


export default router;
