
import { Router } from 'express';
import { 
    initDispatch, 
    signDispatchPending, 
    getPendingSignaturesForUser 
} from '../controllers/dispatch.controller.js';

const router = Router();

router.post('/init', initDispatch);
router.post('/sign-pending', signDispatchPending);
router.get('/pending-signatures/:userId', getPendingSignaturesForUser);

export default router;
