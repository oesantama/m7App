
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';

export const getAllSignatures = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT 
                ds.id, 
                ds.idusuario AS "userId", 
                u.name AS "userName", 
                u.email,
                ds.firma AS "signature", 
                ds.aceptapolitica AS "policyAccepted",
                ds.aprobada, 
                ds.usuarioaprobo AS "approvedBy", 
                ds.fechaparobacion AS "approvedAt",
                ds.estado,
                ds.fecha_creacion AS "createdAt"
            FROM digital_signatures ds
            JOIN users u ON ds.idusuario = u.id
            ORDER BY ds.fecha_creacion DESC
        `);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getSignature = async (req: Request, res: Response) => {
    const { userId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM digital_signatures WHERE idusuario = $1', [userId]);
        if (result.rows.length === 0) {
            return res.json({ found: false });
        }
        // Don't return password
        const { pasword, ...data } = result.rows[0];
        res.json({ found: true, data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const saveSignature = async (req: Request, res: Response) => {
    const { userId, password, signature, policyAccepted, createdBy } = req.body;
    
    try {
        const check = await pool.query('SELECT * FROM digital_signatures WHERE idusuario = $1', [userId]);
        
        if (check.rows.length > 0) {
            // UPDATE
            const existing = check.rows[0];
            
            if (existing.aprobada) {
                // If approved, ONLY password can be changed.
                let newPass = existing.pasword;
                if (password && password.trim() !== '') {
                    const salt = await bcrypt.genSalt(10);
                    newPass = await bcrypt.hash(password, salt);
                }

                await pool.query(
                    `UPDATE digital_signatures 
                     SET pasword = $1, usaurioactualizacion = $2, fecha_actualizacion = CURRENT_TIMESTAMP 
                     WHERE idusuario = $3`,
                    [newPass, createdBy, userId]
                );
                return res.json({ success: true, message: 'Contraseña de firma actualizada (Firma ya aprobada, no se modifica).' });

            } else {
                // Not approved: Can update everything
                let newPass = existing.pasword;
                if (password && password.trim() !== '') {
                    const salt = await bcrypt.genSalt(10);
                    newPass = await bcrypt.hash(password, salt);
                }

                await pool.query(
                    `UPDATE digital_signatures 
                     SET pasword = $1, firma = $2, aceptapolitica = $3, usaurioactualizacion = $4, fecha_actualizacion = CURRENT_TIMESTAMP 
                     WHERE idusuario = $5`,
                    [newPass, signature, policyAccepted, createdBy, userId]
                );
                return res.json({ success: true, message: 'Firma y contraseña actualizadas.' });
            }

        } else {
            // INSERT
            if (!password) return res.status(400).json({ error: 'La contraseña es obligatoria' });
            
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            await pool.query(
                `INSERT INTO digital_signatures (idusuario, pasword, firma, aceptapolitica, usuariocreacion, estado)
                 VALUES ($1, $2, $3, $4, $5, 'EST-01')`,
                [userId, hashedPassword, signature, policyAccepted, createdBy]
            );
            return res.json({ success: true, message: 'Firma digital creada exitosamente.' });
        }
    } catch (error: any) {
        console.error("Save Signature Error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const approveSignature = async (req: Request, res: Response) => {
    const { userId, approverId, approverPassword } = req.body;
    
    try {
        // 1. Validar que el aprobador NO sea el mismo usuario (a menos que sea superusuario)
        // Necesitamos el rol_id del aprobador
        const approverResult = await pool.query('SELECT password, role_id FROM users WHERE id = $1', [approverId]);
        if (approverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Aprobador no encontrado.' });
        }

        const approver = approverResult.rows[0];
        const isSuperUser = approver.role_id === 'ROL-01';

        if (userId === approverId && !isSuperUser) {
            return res.status(403).json({ error: 'No puede aprobar su propia firma. Debe ser aprobada por otro usuario o un administrador.' });
        }

        // 2. Validar que el aprobador tenga contraseña y sea correcta
        if (!approver.password) {
            return res.status(400).json({ error: 'Su usuario no tiene una contraseña asignada para realizar aprobaciones. Por favor asigne una en Gestión de Usuarios.' });
        }

        const validPassword = await bcrypt.compare(approverPassword, approver.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Contraseña de aprobador incorrecta.' });
        }

        // 3. Proceder con la aprobación
        await pool.query(
            `UPDATE digital_signatures 
             SET aprobada = true, usuarioaprobo = $1, fechaparobacion = CURRENT_TIMESTAMP, estado = 'EST-01'
             WHERE idusuario = $2`,
            [approverId, userId]
        );
        res.json({ success: true, message: 'Firma aprobada correctamente.' });
    } catch (error: any) {
        console.error("Approve Signature Error:", error);
        res.status(500).json({ error: error.message });
    }
};
