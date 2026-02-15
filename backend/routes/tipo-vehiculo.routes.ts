import { Router } from 'express';
import { getTiposVehiculo, saveTipoVehiculo, deleteTipoVehiculo } from '../controllers/tipo-vehiculo.controller.js';

const router = Router();

router.get('/', getTiposVehiculo);
router.post('/', saveTipoVehiculo);
router.delete('/:id', deleteTipoVehiculo);

export default router;
