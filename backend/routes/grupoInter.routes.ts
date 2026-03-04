import express from 'express';
import multer from 'multer';
import * as grupoInterController from '../controllers/grupoInter.controller.js';

const router = express.Router();
const upload = multer(); // Usamos memoria para el buffer del Excel

// Rutas de Gestión Grupo Inter
router.post('/upload-excel', upload.single('file'), grupoInterController.uploadExcel);
router.post('/process-pdf', upload.single('file'), grupoInterController.processPDF);
router.get('/orders', grupoInterController.getOrders);

export default router;
