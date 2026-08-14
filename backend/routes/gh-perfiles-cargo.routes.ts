import { Router } from 'express';
import multer from 'multer';
import {
    uploadExcel,
    listPerfiles,
    mapearCargo,
    descargarPdfReferencia,
    descargarPdfFirmado,
    tracking,
    misPendientes,
    firmarAutenticado,
    generarToken,
    publicoVerificar,
    publicoDocumento,
    publicoFirmar,
    buscarPersonalDisponible,
    agregarPersona,
    eliminarPendiente,
} from '../controllers/gh-perfiles-cargo.controller.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// Autenticado por JWT (middleware global en server.ts)
router.post('/upload', upload.single('archivo'), uploadExcel);
router.get('/', listPerfiles);
router.get('/mis-pendientes', misPendientes);
router.get('/tracking', tracking);
router.post('/:id/mapear', mapearCargo);
router.get('/:id/pdf', descargarPdfReferencia);
router.get('/firmas/:firmaId/pdf-firmado', descargarPdfFirmado);
router.post('/firmas/:firmaId/firmar', firmarAutenticado);
router.post('/firmas/:firmaId/generar-token', generarToken);
router.delete('/firmas/:firmaId', eliminarPendiente);
router.get('/:id/personal-disponible', buscarPersonalDisponible);
router.post('/:id/personal', agregarPersona);

// Público — sin JWT, protegido por token de un solo uso + últimos 4 dígitos de cédula
export const publicRouter = Router();
publicRouter.get('/:token', publicoVerificar);
publicRouter.get('/:token/documento', publicoDocumento);
publicRouter.post('/:token/firmar', publicoFirmar);

export default router;
