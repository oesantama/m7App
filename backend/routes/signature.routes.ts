import { Router } from 'express';
import * as signatureCtrl from '../controllers/digital-signature.controller.js';

const router = Router();

router.get('/', signatureCtrl.getAllSignatures);
router.post('/', signatureCtrl.saveSignature);
router.post('/approve', signatureCtrl.approveSignature);
router.get('/:userId', signatureCtrl.getSignature);

export default router;
