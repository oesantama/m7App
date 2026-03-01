
import { Router } from 'express';
import { getVehicles, saveVehicle, deleteVehicle, bulkSaveVehicles } from '../controllers/vehicle.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasVehiclesPerm = user?.permissions?.some((p: any) => p.module === 'PAG-14' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));

  if (isSuper || hasVehiclesPerm || hasRutasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver vehículos' });
}, getVehicles);
router.post('/', requirePermission('VEHICULOS', 'create'), saveVehicle);
router.post('/bulk', requirePermission('VEHICULOS', 'create'), bulkSaveVehicles);
router.delete('/:id', requirePermission('VEHICULOS', 'delete'), deleteVehicle);


export default router;
