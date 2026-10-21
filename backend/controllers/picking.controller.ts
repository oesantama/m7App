
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

export const initPicking = async (req: Request, res: Response) => {
    const { invoiceId, leaderId, createdBy } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Crear registro de alistado (inicialmente solo con el líder)
        const insertRes = await client.query(`
            INSERT INTO picking_assignments (
                invoice_id, leader_id, status, created_by, started_at
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        `, [
            invoiceId, leaderId, 'IN_PROGRESS', createdBy
        ]);

        const pickingId = insertRes.rows[0].id;

        await client.query('COMMIT');
        res.json({ success: true, pickingId });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Init Picking Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

export const finishPicking = async (req: Request, res: Response) => {
    const { pickingId, helperIds } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Actualizar el equipo en la asignación principal
        await client.query(`
            UPDATE picking_assignments 
            SET status = 'PENDING_SIGNATURES', 
                helper_ids = $1,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [JSON.stringify(helperIds || []), pickingId]);

        // 2. Obtener líder para asegurar que también esté en la tabla de firmas
        const assignRes = await client.query('SELECT leader_id FROM picking_assignments WHERE id = $1', [pickingId]);
        const leaderId = assignRes.rows[0].leader_id;

        // 3. Insertar todas las firmas pendientes (Líder + Auxiliares)
        const allTeam = Array.from(new Set([leaderId, ...(helperIds || [])]));
        for (const userId of allTeam) {
            await client.query(`
                INSERT INTO picking_signatures (picking_id, user_id, signed)
                VALUES ($1, $2, false)
                ON CONFLICT (picking_id, user_id) DO NOTHING
            `, [pickingId, userId]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

export const signPicking = async (req: Request, res: Response) => {
    const { pickingId, userId, password } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Validar contraseña
        const userRes = await client.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');

        const valid = await bcrypt.compare(password, userRes.rows[0].password);
        if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

        // 2. Actualizar firma
        const updateRes = await client.query(`
            UPDATE picking_signatures 
            SET signed = true, signed_at = CURRENT_TIMESTAMP 
            WHERE picking_id = $1 AND user_id = $2 AND signed = false
            RETURNING id
        `, [pickingId, userId]);

        if (updateRes.rows.length === 0) {
            throw new Error('No hay firma pendiente o ya firmó.');
        }

        // 3. Verificar si todos firmaron para completar el proceso
        const pendingCount = await client.query(
            'SELECT COUNT(*) FROM picking_signatures WHERE picking_id = $1 AND signed = false',
            [pickingId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await client.query(
                "UPDATE picking_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [pickingId]
            );
            
            // Opcionalmente actualizar estado de ítems
            const assignRes = await client.query('SELECT invoice_id FROM picking_assignments WHERE id = $1', [pickingId]);
            const invId = assignRes.rows[0].invoice_id;
            await client.query("UPDATE document_items SET item_status = 'EST-09' WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = $1 OR COALESCE(NULLIF(invoice, ''), order_number) = $1", [invId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, completed: parseInt(pendingCount.rows[0].count) === 0 });
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};


export const getPickingStatus = async (req: Request, res: Response) => {
    const { invoiceId } = req.params;
    try {
        const result = await pool.query(`
            SELECT pa.*, 
            (SELECT json_agg(ps.*) FROM picking_signatures ps WHERE ps.picking_id = pa.id) as signatures
            FROM picking_assignments pa
            WHERE pa.invoice_id = $1
            ORDER BY pa.started_at DESC LIMIT 1
        `, [invoiceId]);
        res.json(result.rows[0] || null);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
