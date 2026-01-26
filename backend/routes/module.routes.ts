
import { Router } from 'express';
import { getModules, saveModule } from '../controllers/module.controller.js';

const router = Router();

router.get('/', getModules);
router.post('/', saveModule);

export default router;
