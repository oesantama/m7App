
import { Router } from 'express';
import { getAssignments, saveAssignment, endAssignment } from '../controllers/assignment.controller.js';

const router = Router();

router.get('/', getAssignments);
router.post('/', saveAssignment);
router.put('/:id/end', endAssignment);

export default router;
