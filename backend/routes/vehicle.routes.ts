
import { Router } from 'express';
import { getVehicles, saveVehicle, deleteVehicle, bulkSaveVehicles } from '../controllers/vehicle.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasPerm = user?.permissions?.some((p: any) => 
    (p.module === 'VEHICULOS' || p.module === 'PAG-40' || p.module === 'CONCILIACION') && 
    p.actions.includes('view')
  );
  if (isSuper || hasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver vehículos' });
}, getVehicles);
router.post('/', requirePermission('VEHICULOS', 'create'), saveVehicle);
router.post('/bulk', requirePermission('VEHICULOS', 'create'), bulkSaveVehicles);
router.delete('/:id', requirePermission('VEHICULOS', 'delete'), deleteVehicle);


export default router;
