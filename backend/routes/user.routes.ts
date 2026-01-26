
import { Router } from 'express';
import { getUsers, saveUser } from '../controllers/user.controller.js';

const router = Router();

router.get('/', getUsers);
router.post('/', saveUser);

export default router;
