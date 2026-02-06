
import { Router } from 'express';
import { getUsers, saveUser, deleteUser } from '../controllers/user.controller.js';

const router = Router();

router.get('/', getUsers);
router.post('/', saveUser);
router.delete('/:id', deleteUser);

export default router;
