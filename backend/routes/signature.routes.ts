
import { Router } from 'express';
import * as signatureCtrl from '../controllers/signature.controller.js';

const router = Router();

router.post('/', signatureCtrl.createSignature);
router.post('/validate', signatureCtrl.validateSignature);
router.get('/:id', signatureCtrl.getSignature);

export default router;
