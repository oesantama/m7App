
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';

export const initPicking = async (req: Request, res: Response) => {
    const { invoiceId, leaderId, createdBy } = req.body;
    const pickingId = `PICK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
        await pool.query('BEGIN');

        // 1. Crear registro de alistado (inicialmente solo con el líder)
        const insertRes = await pool.query(`
            INSERT INTO picking_assignments (
                invoice_id, leader_id, status, created_by, started_at
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        `, [
            invoiceId, leaderId, 'IN_PROGRESS', createdBy
        ]);

        const pickingId = insertRes.rows[0].id;

        await pool.query('COMMIT');
        res.json({ success: true, pickingId });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        console.error("Init Picking Error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const finishPicking = async (req: Request, res: Response) => {
    const { pickingId, helperIds } = req.body;
    try {
        await pool.query('BEGIN');

        // 1. Actualizar el equipo en la asignación principal
        await pool.query(`
            UPDATE picking_assignments 
            SET status = 'PENDING_SIGNATURES', 
                helper_ids = $1,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [JSON.stringify(helperIds || []), pickingId]);

        // 2. Obtener líder para asegurar que también esté en la tabla de firmas
        const assignRes = await pool.query('SELECT leader_id FROM picking_assignments WHERE id = $1', [pickingId]);
        const leaderId = assignRes.rows[0].leader_id;

        // 3. Insertar todas las firmas pendientes (Líder + Auxiliares)
        const allTeam = Array.from(new Set([leaderId, ...(helperIds || [])]));
        for (const userId of allTeam) {
            await pool.query(`
                INSERT INTO picking_signatures (picking_id, user_id, signed)
                VALUES ($1, $2, false)
                ON CONFLICT (picking_id, user_id) DO NOTHING
            `, [pickingId, userId]);
        }

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
};

export const signPicking = async (req: Request, res: Response) => {
    const { pickingId, userId, password } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Validar contraseña
        const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');

        const valid = await bcrypt.compare(password, userRes.rows[0].password);
        if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

        // 2. Actualizar firma
        const updateRes = await pool.query(`
            UPDATE picking_signatures 
            SET signed = true, signed_at = CURRENT_TIMESTAMP 
            WHERE picking_id = $1 AND user_id = $2 AND signed = false
            RETURNING id
        `, [pickingId, userId]);

        if (updateRes.rows.length === 0) {
            throw new Error('No hay firma pendiente o ya firmó.');
        }

        // 3. Verificar si todos firmaron para completar el proceso
        const pendingCount = await pool.query(
            'SELECT COUNT(*) FROM picking_signatures WHERE picking_id = $1 AND signed = false',
            [pickingId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await pool.query(
                "UPDATE picking_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [pickingId]
            );
            
            // Opcionalmente actualizar estado de ítems
            const assignRes = await pool.query('SELECT invoice_id FROM picking_assignments WHERE id = $1', [pickingId]);
            const invId = assignRes.rows[0].invoice_id;
            await pool.query("UPDATE document_items SET item_status = 'ALISTADO' WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = $1 OR COALESCE(NULLIF(invoice, ''), order_number) = $1", [invId]);
        }

        await pool.query('COMMIT');
        res.json({ success: true, completed: parseInt(pendingCount.rows[0].count) === 0 });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: error.message });
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
