import { Router } from 'express';
import {
    getInventariosFisicos,
    getInventarioFisicoById,
    createInventarioFisico,
    saveConteos,
    saveJustificaciones,
    generarCodigo,
    cerrarInventario,
    anularInventario,
} from '../controllers/gh-inventario-fisico.controller.js';

const router = Router();

router.get('/', getInventariosFisicos);
router.get('/:id', getInventarioFisicoById);
router.post('/', createInventarioFisico);
router.put('/:id/items', saveConteos);
router.put('/:id/justificar', saveJustificaciones);
router.post('/:id/generar-codigo', generarCodigo);
router.post('/:id/cerrar', cerrarInventario);
router.patch('/:id/anular', anularInventario);

export default router;
