
import { Router } from 'express';
import { getDocuments, syncInventory } from '../controllers/document.controller.js';

const router = Router();

router.get('/', getDocuments);
router.post('/sync-inventory', syncInventory);

export default router;
