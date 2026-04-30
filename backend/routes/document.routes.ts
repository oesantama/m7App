import { Router } from 'express';
import { uploadCumplido, getDocumentStats } from '../controllers/document.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import multer from 'multer';
import os from 'os';

const router = Router();
const upload = multer({ dest: os.tmpdir() }); // Guardar temporalmente en carpeta del sistema

// Ruta para subir cumplidos (Protegida por Token)
router.post('/upload-cumplido', authenticateToken, upload.single('file'), uploadCumplido);

// Ruta para el Dashboard de eficiencia
router.get('/stats', authenticateToken, getDocumentStats);

export default router;
