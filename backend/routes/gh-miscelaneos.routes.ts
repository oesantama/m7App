import { Router } from 'express';
import {
  getGhMiscelaneos,
  saveGhMiscelaneo,
  deleteGhMiscelaneo,
} from '../controllers/gh-miscelaneos.controller.js';

const router = Router();

router.get('/:tabla', getGhMiscelaneos);
router.post('/:tabla', saveGhMiscelaneo);
router.delete('/:tabla/:id', deleteGhMiscelaneo);

export default router;
