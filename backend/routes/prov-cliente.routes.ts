import { Router } from 'express';
import {
  getProvClientes,
  saveProvCliente,
  deleteProvCliente,
  bulkSaveProvClientes
} from '../controllers/prov-cliente.controller.js';

const router = Router();

router.get('/', getProvClientes);
router.post('/', saveProvCliente);
router.post('/bulk', bulkSaveProvClientes);
router.delete('/:id', deleteProvCliente);

export default router;
