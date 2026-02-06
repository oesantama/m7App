
import { Router } from 'express';
import { getPages, savePage, deletePage } from '../controllers/page.controller.js';

const router = Router();

router.get('/', getPages);
router.post('/', savePage);
router.delete('/:id', deletePage);

export default router;
