import { Router } from 'express';
import { authenticateApiKey } from '../middleware/apiKey.middleware.js';
import {
    listInventario,
    getBySerial,
    upsertInventario,
    uploadJson,
    generateActaPdf,
    listAreas,
    downloadScript,
    generateScriptToken,
    downloadScriptByToken
} from '../controllers/it-activos.controller.js';

const router = Router();

// Autenticado por API Key — llamado por el script PowerShell/Bash desatendido en el PC
router.post('/upload-json', authenticateApiKey, uploadJson);

// Público — enlace de un solo uso generado por un usuario ya autenticado (flujo "curl | bash")
router.get('/script/dl/:token', downloadScriptByToken);

// Autenticado por JWT de usuario (middleware global en server.ts)
router.get('/', listInventario);
router.get('/areas', listAreas);
router.get('/script', downloadScript);
router.post('/script/token', generateScriptToken);
router.get('/:serial', getBySerial);
router.post('/manual', upsertInventario);
router.get('/:id/acta-pdf', generateActaPdf);

export default router;
