
import { Router } from 'express';
import { getAssignments, saveAssignment, endAssignment } from '../controllers/assignment.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  // Permitir si tiene ASIGNACIONES o CONCILIACION
  const hasPerm = user?.permissions?.some((p: any) => 
    (p.module === 'ASIGNACIONES' || p.module === 'PAG-40' || p.module === 'CONCILIACION') && 
    p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ASIGNACIONES' });
}, getAssignments);
router.post('/', requirePermission('ASIGNACIONES', 'create'), saveAssignment);
router.put('/:id/end', requirePermission('ASIGNACIONES', 'edit'), endAssignment);


export default router;
