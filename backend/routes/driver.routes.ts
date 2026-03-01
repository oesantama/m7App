
import { Router } from 'express';
import { getDrivers, saveDriver, deleteDriver, bulkSaveDrivers } from '../controllers/driver.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasDriversPerm = user?.permissions?.some((p: any) => p.module === 'PAG-14' && p.actions.includes('view')); // Conductores suele ser PAG-14 también
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));

  if (isSuper || hasDriversPerm || hasRutasPerm) return next();
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver conductores' });
}, getDrivers);
router.post('/', requirePermission('CONDUCTORES', 'create'), saveDriver);
router.post('/bulk', requirePermission('CONDUCTORES', 'create'), bulkSaveDrivers);
router.delete('/:id', requirePermission('CONDUCTORES', 'delete'), deleteDriver);


export default router;
