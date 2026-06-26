import { Router } from 'express';
import multer from 'multer';
import * as n from '../controllers/noticias.controller.js';
import { requirePermission, authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Admin CRUD (requieren permiso NOTICIAS)
router.get('/',        requirePermission('NOTICIAS', 'view'),   n.getNoticias);
router.post('/',       requirePermission('NOTICIAS', 'create'), n.saveNoticia);
router.put('/:id',     requirePermission('NOTICIAS', 'edit'),   n.saveNoticia);
router.delete('/:id',            requirePermission('NOTICIAS', 'delete'), n.deleteNoticia);
router.delete('/:id/archivo',    requirePermission('NOTICIAS', 'edit'),   n.deleteArchivoNoticia);
router.post('/upload', requirePermission('NOTICIAS', 'create'), upload.single('archivo'), n.uploadArchivoNoticia);

// Feed para usuarios autenticados (sin permiso especial)
router.get('/feed', n.getNoticiasApp);

// Stream de archivo (autenticado)
router.get('/:id/stream', n.streamArchivoNoticia);

// Asistencias por noticia (autenticado con JWT)
router.get( '/:id/asistencia/check',       authenticateToken, n.checkNoticiaAsistencia);
router.get( '/:id/asistencia',             authenticateToken, n.getNoticiaAsistencia);
router.post('/:id/asistencia',             authenticateToken, n.registerNoticiaAsistencia);
router.delete('/:id/asistencia/:asistId',  authenticateToken, n.deleteNoticiaAsistencia);
router.get( '/:id/asistencia/pdf',         authenticateToken, n.downloadNoticiaAsistenciaPDF);
router.post('/:id/asistencia/upload-drive',authenticateToken, n.uploadNoticiaAsistenciaToDrive);

// Feed público (whitelisteado en server.ts)
router.get('/public/feed',       n.getNoticiasPublicas);
router.get('/public/:id',        n.getNoticiaPublicaById);
router.get('/public/:id/stream', n.streamArchivoNoticia);

export default router;
