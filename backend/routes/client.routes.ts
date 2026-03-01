
import { Router } from 'express';
import { getClients, saveClient, deleteClient } from '../controllers/client.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  // Permitir si tiene CLIENTES:view O RUTAS:view
  const user = (req as any).user;
  const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const hasClientsPerm = user?.permissions?.some((p: any) => p.module === 'PAG-03' && p.actions.includes('view'));
  const hasRutasPerm = user?.permissions?.some((p: any) => p.module === 'PAG-15' && p.actions.includes('view'));

  if (isSuper || hasClientsPerm || hasRutasPerm) {
    return next();
  }
  res.status(403).json({ success: false, error: 'Permiso insuficiente para ver clientes' });
}, getClients);
router.post('/', requirePermission('CLIENTES', 'create'), saveClient);
router.delete('/:id', requirePermission('CLIENTES', 'delete'), deleteClient);


export default router;
