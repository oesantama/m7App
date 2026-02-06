
import { Router } from 'express';
import { getArticles, saveArticle, deleteArticle } from '../controllers/article.controller.js';

const router = Router();

router.get('/', getArticles);
router.post('/', saveArticle);
router.delete('/:id', deleteArticle);

export default router;
