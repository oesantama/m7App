import { Router } from 'express';
import { uploadReports, getReports, uploadReceiptDates, uploadEgressDates } from '../controllers/management-report.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoint to upload rows from parsed Excel files
router.post('/upload', authenticateToken, uploadReports);

// Endpoints to upload custom dates matching by Consecutivo
router.post('/upload-receipt-dates', authenticateToken, uploadReceiptDates);
router.post('/upload-egress-dates', authenticateToken, uploadEgressDates);

// Endpoint to fetch paginated rows with filter capabilities
router.get('/', authenticateToken, getReports);

export default router;
