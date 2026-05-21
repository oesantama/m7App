import { Router } from 'express';
import { getTarifas, saveTarifa, deleteTarifa, bulkSaveTarifas } from '../controllers/tarifas-linea-blanca.controller.js';

const router = Router();

router.get('/', getTarifas);
router.post('/', saveTarifa);
router.post('/bulk', bulkSaveTarifas);
router.delete('/:id', deleteTarifa);

export default router;
