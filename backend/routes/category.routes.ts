
import { Router } from 'express';
import { saveCategory, getCategories, deleteCategory } from '../controllers/category.controller.js';

const router = Router();

router.get('/', getCategories);
router.post('/', saveCategory);
router.delete('/:id', deleteCategory);

export default router;
