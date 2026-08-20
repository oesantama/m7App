import express from 'express';
import multer from 'multer';
import * as grupoInterController from '../controllers/grupoInter.controller.js';

const router = express.Router();

// Configuración de almacenamiento en disco para proteger la RAM del servidor
const storage = multer.diskStorage({
  destination: '/tmp', // Usamos el directorio temporal del sistema
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // Límite de 200MB por archivo
});

// Multer con límite reducido para el upload público del conductor (evita abuso, es sin auth)
const uploadPublicPhoto = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB — suficiente para una foto de cumplido
});

// Rutas de Gestión Grupo Inter
router.post('/upload-excel', upload.single('file'), grupoInterController.uploadExcel);
router.post('/upload-manifest-excel', upload.single('file'), grupoInterController.uploadManifestExcel);
router.post('/process-pdf', upload.single('file'), grupoInterController.processPDF);
router.get('/orders', grupoInterController.getOrders);
router.put('/status/:id', grupoInterController.updateStatus);
router.put('/manifiesto/:id', grupoInterController.updateManifiesto);
router.delete('/cumplido/:id', grupoInterController.deleteCumplido);
router.get('/details/:id', grupoInterController.getOrderDetails);

// Novedades y Reajustes
router.get('/novedades/:pedido_id', grupoInterController.getNovedades);
router.post('/novedades', grupoInterController.addNovedad);
router.get('/reajustes/:pedido_id', grupoInterController.getReajustes);
router.post('/reajustes', grupoInterController.addReajuste);

// API Pública (WebService para Clientes Externos)
router.get('/public/list', grupoInterController.getOrdersPublicListSecure);
router.get('/public/soporte/:numeroDocumento', grupoInterController.getPublicSoporte);
router.get('/public/seguimiento/:numeroDocumento', grupoInterController.getPublicSeguimiento);

// Link público de conductor (sin auth) — sube el cumplido de su ruta/placa
router.get('/public/cumplido/:token', grupoInterController.getPublicCumplido);
router.post('/public/cumplido/:token/:pedidoId', uploadPublicPhoto.single('foto'), grupoInterController.uploadPublicCumplido);

// Generación del link público (interno, requiere auth vía middleware global)
router.get('/rutas-placa', grupoInterController.getRutasPorPlaca);
router.post('/public-link', grupoInterController.createPublicLink);
router.get('/soporte/:id', grupoInterController.getSoporteInterno);

export default router;
