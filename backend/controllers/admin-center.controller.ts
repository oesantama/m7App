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

export const updateFormatoTransporte = async (req: Request, res: Response) => {
    const { oldId } = req.params;
    const { newId, nombre, orden } = req.body;
    try {
        const query = `
            UPDATE opt_formatos
            SET id = $1, nombre = $2, orden = $3
            WHERE id = $4
            RETURNING *
        `;
        const result = await pool.query(query, [newId, nombre, Number(orden), oldId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Formato no encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error updating transport format:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
