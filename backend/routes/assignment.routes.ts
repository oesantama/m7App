
import { Router } from 'express';
import { getAssignments, saveAssignment, endAssignment } from '../controllers/assignment.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requirePermission('ASIGNACIONES', 'view'), getAssignments);
router.post('/', requirePermission('ASIGNACIONES', 'create'), saveAssignment);
router.put('/:id/end', requirePermission('ASIGNACIONES', 'edit'), endAssignment);


export default router;
