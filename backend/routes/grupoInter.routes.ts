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

// Rutas de Gestión Grupo Inter
router.post('/upload-excel', upload.single('file'), grupoInterController.uploadExcel);
router.post('/upload-manifest-excel', upload.single('file'), grupoInterController.uploadManifestExcel);
router.post('/process-pdf', upload.single('file'), grupoInterController.processPDF);
router.get('/orders', grupoInterController.getOrders);
router.put('/status/:id', grupoInterController.updateStatus);
router.get('/details/:id', grupoInterController.getOrderDetails);

// Novedades y Reajustes
router.get('/novedades/:pedido_id', grupoInterController.getNovedades);
router.post('/novedades', grupoInterController.addNovedad);
router.get('/reajustes/:pedido_id', grupoInterController.getReajustes);
router.post('/reajustes', grupoInterController.addReajuste);

// API Pública (WebService para Clientes Externos)
router.get('/public/list', grupoInterController.getOrdersPublicListSecure);

export default router;
