import { Router } from 'express';
import {
    getFlotaReport,
    uploadTdmManifiestos, getTdmManifiestos, deleteTdmManifiesto,
} from '../controllers/flota.controller.js';

const router = Router();

router.get('/report', getFlotaReport);

// TDM manifiestos (carga Excel)
router.post('/tdm/upload', uploadTdmManifiestos);
router.get('/tdm/manifiestos', getTdmManifiestos);
router.delete('/tdm/manifiestos/:id', deleteTdmManifiesto);

export default router;
