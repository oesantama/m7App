import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getVisitas = async (req: Request, res: Response) => {
    try {
        const { from, to, search } = req.query;
        let query = `
            SELECT * FROM gh_visitas 
            WHERE 1=1
        `;
        const params: any[] = [];
        let p = 1;

        if (from) {
            query += ` AND fecha_entrada >= $${p++}`;
            params.push(from);
        }
        if (to) {
            query += ` AND fecha_entrada <= $${p++}`;
            params.push(`${to} 23:59:59`);
        }
        if (search) {
            query += ` AND (nombre ILIKE $${p} OR cedula ILIKE $${p})`;
            params.push(`%${search}%`);
            p++;
        }

        query += ` ORDER BY fecha_entrada DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err: any) {
        console.error('[GH-VISITAS] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

export const saveVisita = async (req: Request, res: Response) => {
    const {
        nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
        contacto_emergencia, acuerdo_requisitos, contiene_equipos,
        marca_dispositivo, numero_serie, registrado_por_id, registrado_por_nombre,
        fecha_entrada, hora_salida
    } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO gh_visitas (
                nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
                contacto_emergencia, acuerdo_requisitos, contiene_equipos,
                marca_dispositivo, numero_serie, registrado_por_id, registrado_por_nombre,
                fecha_entrada, fecha_registro, hora_salida
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
            RETURNING *
        `, [
            nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
            contacto_emergencia, acuerdo_requisitos, contiene_equipos,
            marca_dispositivo, numero_serie, registrado_por_id, registrado_por_nombre,
            fecha_entrada || new Date(),
            hora_salida || null
        ]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        console.error('[GH-VISITAS] Save Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

export const marcarSalida = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query(`
            UPDATE gh_visitas 
            SET hora_salida = NOW() 
            WHERE id = $1
        `, [id]);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[GH-VISITAS] Salida Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};
