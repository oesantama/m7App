/**
 * hojas-vida.routes.ts
 * Rutas del sistema de Hojas de Vida (MOD-14)
 * Montado bajo /api → rutas relativas aquí.
 *
 * Rutas internas (JWT): /api/hv/*
 * Rutas públicas (token): /api/public/hv/*
 */

import { Router } from 'express';
import multer from 'multer';
import {
    getCatalogos,
    crearSolicitud,
    listarSolicitudes,
    getSolicitud,
    cambiarEstadoSolicitud,
    reenviarLink,
    aprobarDocumento,
    registrarDocFisica,
    getDashboard,
    getAlertas,
    getMaestras,
    upsertTipoDocumento,
    serveLocalFile,
    getAuditoria,
    getPublicSolicitud,
    guardarDatosPublico,
    subirDocumentoPublico,
    submitFormularioPublico,
} from '../controllers/hojas-vida.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── RUTAS INTERNAS (protegidas por JWT en server.ts) ────────────────────────

// Catálogos
router.get('/catalogos', getCatalogos);

// Dashboard / KPIs
router.get('/dashboard', getDashboard);
router.get('/alertas', getAlertas);

// Solicitudes
router.get('/solicitudes', listarSolicitudes);
router.post('/solicitudes', crearSolicitud);
router.get('/solicitudes/:id', getSolicitud);
router.patch('/solicitudes/:id/estado', cambiarEstadoSolicitud);
router.post('/solicitudes/:id/reenviar-link', reenviarLink);
router.post('/solicitudes/:id/doc-fisica', registrarDocFisica);

// Documentos (revisión interna)
router.patch('/documentos/:docId/aprobar', aprobarDocumento);

// Auditoría
router.get('/auditoria', getAuditoria);

// Maestras parametrizables
router.get('/maestras', getMaestras);
router.put('/maestras/tipos-documento', upsertTipoDocumento);

// Archivos locales (fallback rclone) — path viene como query ?p=ruta/al/archivo
router.get('/file', serveLocalFile);

export default router;

// ─── ROUTER PÚBLICO (sin JWT) ─────────────────────────────────────────────────
// Exportado separado para montarlo en /api/public/hv en index.ts

export const hvPublicRouter = Router();

hvPublicRouter.get('/catalogos', getCatalogos);
hvPublicRouter.get('/:token', getPublicSolicitud);
hvPublicRouter.patch('/:token/datos', guardarDatosPublico);
hvPublicRouter.post('/:token/documento', upload.single('archivo'), subirDocumentoPublico);
hvPublicRouter.post('/:token/submit', submitFormularioPublico);
