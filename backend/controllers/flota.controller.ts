import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getFlotaReport = async (req: Request, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) {
        return res.status(400).json({ success: false, error: 'Los parámetros from y to son requeridos' });
    }

    try {
        const result = await pool.query(
            `WITH manifests AS (
                SELECT
                    TRIM(client_name) AS client_name,
                    1 AS quantity,
                    CASE WHEN UPPER(TRIM(client_name)) LIKE '%TDM%' THEN 'TDM' ELSE 'M7' END AS operator,
                    COALESCE(UPPER(TRIM(city)), 'SIN CIUDAD') AS city
                FROM management_orders
                WHERE manifest_date::date BETWEEN $1 AND $2
                  AND manifest_status NOT IN ('ANULADO', 'CANCELADO', 'ANULADA')
                  AND manifest_date IS NOT NULL
            ),
            manual AS (
                SELECT
                    TRIM(client_name) AS client_name,
                    quantity,
                    'TDM' AS operator,
                    COALESCE(UPPER(TRIM(city)), 'SIN CIUDAD') AS city
                FROM flota_manual_entries
                WHERE operation_date BETWEEN $1 AND $2
            ),
            combined AS (
                SELECT * FROM manifests
                UNION ALL
                SELECT * FROM manual
            )
            SELECT
                client_name,
                operator,
                city,
                SUM(quantity)::int AS quantity
            FROM combined
            GROUP BY client_name, operator, city
            ORDER BY operator, quantity DESC`,
            [from, to]
        );

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-FLOTA-REPORT-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getManualEntries = async (req: Request, res: Response) => {
    const { from, to, clientId } = req.query;
    try {
        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (from) { conditions.push(`operation_date >= $${idx++}`); params.push(from); }
        if (to) { conditions.push(`operation_date <= $${idx++}`); params.push(to); }
        if (clientId) { conditions.push(`client_id = $${idx++}`); params.push(clientId); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT id, client_id, client_name, operation_date, quantity, city, notes, created_by, created_at
             FROM flota_manual_entries
             ${where}
             ORDER BY operation_date DESC, created_at DESC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-FLOTA-ENTRIES-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const saveManualEntry = async (req: Request, res: Response) => {
    const { clientId, clientName, operationDate, quantity, city, notes, createdBy } = req.body;

    if (!clientId || !clientName || !operationDate || !quantity) {
        return res.status(400).json({ success: false, error: 'clientId, clientName, operationDate y quantity son obligatorios' });
    }
    if (Number(quantity) <= 0) {
        return res.status(400).json({ success: false, error: 'La cantidad debe ser mayor a 0' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO flota_manual_entries (client_id, client_name, operation_date, quantity, city, notes, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING *`,
            [clientId, clientName, operationDate, Number(quantity), city || 'SIN CIUDAD', notes || null, createdBy || null]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        console.error('[M7-FLOTA-SAVE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteManualEntry = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM flota_manual_entries WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-FLOTA-DELETE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
