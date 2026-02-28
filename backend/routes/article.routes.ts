
import { Router } from 'express';
import { getArticles, saveArticle, deleteArticle } from '../controllers/article.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission('ARTICULOS', 'view'), getArticles);
router.post('/', requirePermission('ARTICULOS', 'create'), saveArticle);
router.delete('/:id', requirePermission('ARTICULOS', 'delete'), deleteArticle);


export default router;
