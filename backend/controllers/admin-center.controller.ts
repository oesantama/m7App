import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getFormatosTransportes = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, nombre, orden
            FROM opt_formatos
            ORDER BY orden ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching transport formats:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
