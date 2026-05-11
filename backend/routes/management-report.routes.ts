import { Router } from 'express';
import { uploadReports, getReports } from '../controllers/management-report.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoint to upload rows fromparsed Excel files
router.post('/upload', authenticateToken, uploadReports);

// Endpoint to fetch paginated rows with filter capabilities
router.get('/', authenticateToken, getReports);

export default router;
