
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import clientRoutes from './client.routes.js';
import articleRoutes from './article.routes.js';
import vehicleRoutes from './vehicle.routes.js';
import documentRoutes from './document.routes.ts';
import notificationRoutes from './notification.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import roleRoutes from './role.routes.js';
import moduleRoutes from './module.routes.js';
import pageRoutes from './page.routes.js';
import permissionRoutes from './permission.routes.js';
import userPermissionRoutes from './user-permission.routes.js';
import aiRoutes from './ai.routes.js';


const router = Router();

router.use('/auth', authRoutes);
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
router.use('/user-permissions', userPermissionRoutes);
router.use('/ai', aiRoutes);


export default router;
