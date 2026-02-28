import { Router } from 'express';
import * as trainingController from '../controllers/training.controller.js';

const router = Router();

// Rutas Públicas/Usuario
router.get('/categories', trainingController.getCategories);
router.get('/courses', trainingController.getCourses);
router.get('/courses/:id', trainingController.getCourseWithLessons);
router.post('/progress', trainingController.updateProgress);

// Rutas Admin
router.post('/courses', trainingController.saveCourse);
router.post('/lessons', trainingController.saveLesson);

export default router;
