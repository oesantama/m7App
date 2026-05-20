import { Router } from 'express';
import {
  getGhMiscelaneos,
  saveGhMiscelaneo,
  deleteGhMiscelaneo,
} from '../controllers/gh-miscelaneos.controller.js';
import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/:tabla', getGhMiscelaneos);
router.post('/:tabla', requirePermission('MISCELANEOS_GH', 'create'), saveGhMiscelaneo);
router.delete('/:tabla/:id', requirePermission('MISCELANEOS_GH', 'edit'), deleteGhMiscelaneo);

export default router;
