
import { Router } from 'express';
import { 
    getStatus, reconnect, disconnect, getHistory, sendNotification, 
    getQuickReplies, saveQuickReply, deleteQuickReply,
    getChats, getChatMessages, syncContacts
} from '../controllers/whatsapp.controller.js';

import { requirePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/status', requirePermission('WHATSAPP', 'view'), getStatus);
router.post('/connect', requirePermission('WHATSAPP', 'edit'), reconnect);
router.post('/disconnect', requirePermission('WHATSAPP', 'edit'), disconnect);
router.get('/history', requirePermission('WHATSAPP', 'view'), getHistory);
router.post('/send', requirePermission('WHATSAPP', 'create'), sendNotification);

router.get('/chats', requirePermission('WHATSAPP', 'view'), getChats);
router.get('/messages', requirePermission('WHATSAPP', 'view'), getChatMessages);
router.post('/sync-contacts', requirePermission('WHATSAPP', 'edit'), syncContacts);

router.get('/quick-replies', requirePermission('WHATSAPP', 'view'), getQuickReplies);
router.post('/quick-replies', requirePermission('WHATSAPP', 'create'), saveQuickReply);
router.delete('/quick-replies/:id', requirePermission('WHATSAPP', 'delete'), deleteQuickReply);


export default router;
