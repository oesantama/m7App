
import { Router } from 'express';
import { getPages, savePage } from '../controllers/page.controller.js';

const router = Router();

router.get('/', getPages);
router.post('/', savePage);

export default router;
