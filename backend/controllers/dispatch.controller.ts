
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export const initDispatch = async (req: Request, res: Response) => {
    const { 
        invoiceId, 
        driverId, 
        helperIds, 
        scannedItems, 
        isAccompanied, 
        helperCount, 
        createdBy,
        signatures // { userId: string, password?: string, signNow: boolean }[]
    } = req.body;

    const dispatchId = `DIS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
        await pool.query('BEGIN');

        // 1. Crear registro de despacho
        await pool.query(`
            INSERT INTO dispatch_assignments (
                id, invoice_id, driver_id, helper_ids, scanned_items, 
                is_accompanied, helper_count, status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            dispatchId, invoiceId, driverId, JSON.stringify(helperIds || []), 
            JSON.stringify(scannedItems || []), isAccompanied, helperCount, 
            'PENDING_SIGNATURES', createdBy
        ]);

        // 2. Procesar firmas (Inmediatas y Pendientes)
        for (const sig of (signatures || [])) {
            let isSigned = false;
            let signedAt = null;

            if (sig.signNow && sig.password) {
                // Validar firma inmediata
                const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [sig.userId]);
                if (userRes.rows.length > 0) {
                    const valid = await bcrypt.compare(sig.password, userRes.rows[0].password);
                    if (valid) {
                        isSigned = true;
                        signedAt = new Date();
                    } else {
                        throw new Error(`Contraseña incorrecta para el usuario ${sig.userId}`);
                    }
                }
            }

            await pool.query(`
                INSERT INTO dispatch_signatures_pending (dispatch_id, user_id, role_type, signed, signed_at)
                VALUES ($1, $2, $3, $4, $5)
            `, [dispatchId, sig.userId, sig.role, isSigned, signedAt]);
        }

        // 3. Actualizar estado de los ítems en document_items a 'En ruta' (EST-11)
        await pool.query(`
            UPDATE document_items 
            SET item_status = 'En ruta',
                item_id = 'EST-11' -- Asumiendo que item_id o similar guarda el código del estado
            WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = $1
            OR TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = $1
        `, [invoiceId]);

        // 4. Verificar si ya se completaron todas las firmas
        const pendingCount = await pool.query(
            'SELECT COUNT(*) FROM dispatch_signatures_pending WHERE dispatch_id = $1 AND signed = false',
            [dispatchId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await pool.query(
                "UPDATE dispatch_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [dispatchId]
            );
        }

        await pool.query('COMMIT');
        res.json({ success: true, dispatchId, status: parseInt(pendingCount.rows[0].count) === 0 ? 'COMPLETED' : 'PENDING_SIGNATURES' });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        console.error("Init Dispatch Error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const signDispatchPending = async (req: Request, res: Response) => {
    const { dispatchId, userId, password } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Validar contraseña
        const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');

        const valid = await bcrypt.compare(password, userRes.rows[0].password);
        if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

        // 2. Actualizar firma
        const updateRes = await pool.query(`
            UPDATE dispatch_signatures_pending 
            SET signed = true, signed_at = CURRENT_TIMESTAMP 
            WHERE dispatch_id = $1 AND user_id = $2 AND signed = false
            RETURNING id
        `, [dispatchId, userId]);

        if (updateRes.rows.length === 0) {
           throw new Error('No hay firma pendiente para este usuario en este despacho.');
        }

        // 3. Verificar si ya terminó todo el proceso
        const pendingCount = await pool.query(
            'SELECT COUNT(*) FROM dispatch_signatures_pending WHERE dispatch_id = $1 AND signed = false',
            [dispatchId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await pool.query(
                "UPDATE dispatch_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [dispatchId]
            );
        }

        await pool.query('COMMIT');
        res.json({ success: true, completed: parseInt(pendingCount.rows[0].count) === 0 });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
};

export const getPendingSignaturesForUser = async (req: Request, res: Response) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                dsp.dispatch_id AS "dispatchId",
                da.invoice_id AS "invoiceId",
                da.created_at AS "createdAt",
                dsp.role_type AS "role"
            FROM dispatch_signatures_pending dsp
            JOIN dispatch_assignments da ON dsp.dispatch_id = da.id
            WHERE dsp.user_id = $1 AND dsp.signed = false
            ORDER BY da.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
