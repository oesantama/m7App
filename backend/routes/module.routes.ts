import { Router } from 'express';
import { getModules, saveModule, deleteModule } from '../controllers/module.controller.js';

const router = Router();

router.get('/', getModules);
router.post('/', saveModule);
router.delete('/:id', deleteModule);

export default router;
