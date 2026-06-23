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
            tdm_excel AS (
                SELECT
                    CONCAT('TDM ', TRIM(c.name)) AS client_name,
                    1 AS quantity,
                    'TDM' AS operator,
                    COALESCE(UPPER(TRIM(ftm.ciudad_destino)), 'SIN CIUDAD') AS city
                FROM flota_tdm_manifiestos ftm
                LEFT JOIN clients c ON ftm.client_id = c.id
                WHERE ftm.fecha_operacion BETWEEN $1 AND $2
            ),
            combined AS (
                SELECT * FROM manifests
                UNION ALL
                SELECT * FROM tdm_excel
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

// ── TDM MANIFIESTOS (carga por Excel) ─────────────────────────────────────────

export const uploadTdmManifiestos = async (req: Request, res: Response) => {
    const { clientId, rows, uploadedBy } = req.body;

    if (!clientId || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, error: 'clientId y rows son obligatorios' });
    }

    try {
        let inserted = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const row of rows) {
            const manifiesto = String(row.manifiesto || '').trim();
            const fecha = row.fecha_operacion ? String(row.fecha_operacion).trim() : null;

            if (!manifiesto || !fecha) {
                errors.push(`Fila inválida: manifiesto="${manifiesto}" fecha="${fecha}"`);
                continue;
            }

            try {
                const res2 = await pool.query(
                    `INSERT INTO flota_tdm_manifiestos
                        (client_id, manifiesto, fecha_operacion, remesa, valor_cobrar, valor_pagar, ciudad_origen, ciudad_destino, uploaded_by, uploaded_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                     ON CONFLICT (manifiesto) DO UPDATE SET
                        client_id = EXCLUDED.client_id,
                        fecha_operacion = EXCLUDED.fecha_operacion,
                        remesa = EXCLUDED.remesa,
                        valor_cobrar = EXCLUDED.valor_cobrar,
                        valor_pagar = EXCLUDED.valor_pagar,
                        ciudad_origen = EXCLUDED.ciudad_origen,
                        ciudad_destino = EXCLUDED.ciudad_destino,
                        uploaded_by = EXCLUDED.uploaded_by,
                        uploaded_at = NOW()
                     RETURNING (xmax = 0) AS is_insert`,
                    [
                        clientId,
                        manifiesto,
                        fecha,
                        String(row.remesa || '').trim() || null,
                        Number(row.valor_cobrar) || 0,
                        Number(row.valor_pagar) || 0,
                        String(row.ciudad_origen || 'SIN CIUDAD').trim().toUpperCase(),
                        String(row.ciudad_destino || 'SIN CIUDAD').trim().toUpperCase(),
                        uploadedBy || null,
                    ]
                );
                if (res2.rows[0]?.is_insert) inserted++; else updated++;
            } catch (rowErr: any) {
                errors.push(`Error en manifiesto "${manifiesto}": ${rowErr.message}`);
            }
        }

        res.json({ success: true, inserted, updated, errors });
    } catch (err: any) {
        console.error('[M7-FLOTA-TDM-UPLOAD-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getTdmManifiestos = async (req: Request, res: Response) => {
    const { from, to, clientId, view } = req.query;
    try {
        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (from)     { conditions.push(`ftm.fecha_operacion >= $${idx++}`); params.push(from); }
        if (to)       { conditions.push(`ftm.fecha_operacion <= $${idx++}`); params.push(to); }
        if (clientId) { conditions.push(`ftm.client_id = $${idx++}`); params.push(clientId); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        if (view === 'summary') {
            const result = await pool.query(
                `SELECT
                    ftm.client_id,
                    c.name AS client_name,
                    COUNT(*) AS total_manifiestos,
                    SUM(ftm.valor_cobrar) AS total_cobrar,
                    SUM(ftm.valor_pagar) AS total_pagar,
                    MIN(ftm.fecha_operacion) AS fecha_desde,
                    MAX(ftm.fecha_operacion) AS fecha_hasta
                 FROM flota_tdm_manifiestos ftm
                 LEFT JOIN clients c ON ftm.client_id = c.id
                 ${where}
                 GROUP BY ftm.client_id, c.name
                 ORDER BY total_manifiestos DESC`,
                params
            );
            return res.json({ success: true, data: result.rows });
        }

        const result = await pool.query(
            `SELECT ftm.id, ftm.client_id, c.name AS client_name, ftm.manifiesto, ftm.fecha_operacion,
                    ftm.remesa, ftm.valor_cobrar, ftm.valor_pagar, ftm.ciudad_origen, ftm.ciudad_destino,
                    u.name AS uploaded_by, ftm.uploaded_at
             FROM flota_tdm_manifiestos ftm
             LEFT JOIN clients c ON ftm.client_id = c.id
             LEFT JOIN users u ON ftm.uploaded_by = u.id::text
             ${where}
             ORDER BY ftm.fecha_operacion DESC, ftm.uploaded_at DESC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-FLOTA-TDM-GET-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteTdmManifiesto = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query(`DELETE FROM flota_tdm_manifiestos WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-FLOTA-TDM-DELETE-ERR]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
