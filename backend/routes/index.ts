
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import clientRoutes from './client.routes.js';
import articleRoutes from './article.routes.js';
import vehicleRoutes from './vehicle.routes.js';
import driverRoutes from './driver.routes.js';
import documentRoutes from './document.routes.js';
import notificationRoutes from './notification.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import roleRoutes from './role.routes.js';
import moduleRoutes from './module.routes.js';
import pageRoutes from './page.routes.js';
import permissionRoutes from './permission.routes.js';
import assignmentRoutes from './assignment.routes.js';
import userPermissionRoutes from './user-permission.routes.js';
import aiRoutes from './ai.routes.js';
import twoFactorRoutes from './2fa.routes.js';
import systemRoutes from './system.routes.js';
import masterRoutes from './master.routes.js';
import routeRoutes from './route.routes.js';
import signatureRoutes from './signature.routes.js';


const router = Router();

router.use('/masters', masterRoutes);
router.use('/routes', routeRoutes);
router.use('/auth', authRoutes);
router.use('/2fa', twoFactorRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/articles', articleRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/documents', documentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/roles', roleRoutes);
router.use('/modules', moduleRoutes);
router.use('/pages', pageRoutes);
router.use('/permissions', permissionRoutes);
router.use('/drivers', driverRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/user-permissions', userPermissionRoutes);
router.use('/ai', aiRoutes);
router.use('/system', systemRoutes);
router.use('/signatures', signatureRoutes);


export default router;
