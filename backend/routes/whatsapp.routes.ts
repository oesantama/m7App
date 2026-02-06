
import { Router } from 'express';
import { 
    getStatus, reconnect, disconnect, getHistory, sendNotification, 
    getQuickReplies, saveQuickReply, deleteQuickReply,
    getChats, getChatMessages, syncContacts
} from '../controllers/whatsapp.controller.js';

const router = Router();

router.get('/status', getStatus);
router.post('/connect', reconnect);
router.post('/disconnect', disconnect);
router.get('/history', getHistory);
router.post('/send', sendNotification);

router.get('/chats', getChats);
router.get('/messages', getChatMessages);
router.post('/sync-contacts', syncContacts);

router.get('/quick-replies', getQuickReplies);
router.post('/quick-replies', saveQuickReply);
router.delete('/quick-replies/:id', deleteQuickReply);

export default router;
