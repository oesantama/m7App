
import { Router } from 'express';
import { getArticles, saveArticle } from '../controllers/article.controller.js';

const router = Router();

router.get('/', getArticles);
router.post('/', saveArticle);

export default router;
