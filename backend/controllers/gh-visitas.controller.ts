import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getVisitas = async (req: Request, res: Response) => {
    try {
        const { from, to, search, area_id } = req.query;
        let query = `
            SELECT 
                v.*, 
                a.nombre as area_nombre,
                u.name as registrado_por_nombre
            FROM gh_visitas v
            LEFT JOIN gh_areas a ON a.id::text = v.area_dependencia::text
            LEFT JOIN users u ON u.id::text = v.registrado_por_id::text
            WHERE 1=1
        `;
        const params: any[] = [];
        let p = 1;

        if (from) {
            query += ` AND v.fecha_entrada::timestamp >= $${p++}::timestamp`;
            params.push(from);
        }
        if (to) {
            query += ` AND v.fecha_entrada::timestamp <= $${p++}::timestamp`;
            params.push(`${to} 23:59:59`);
        }
        if (search) {
            query += ` AND (v.nombre ILIKE $${p} OR v.cedula ILIKE $${p})`;
            params.push(`%${search}%`);
            p++;
        }
        if (area_id && area_id !== 'all') {
            // Buscamos coincidencia por ID (nuevo) o comparando el nombre del área (legacy)
            query += ` 
                AND (
                    v.area_dependencia::text = $${p} 
                    OR v.area_dependencia ILIKE (SELECT nombre FROM gh_areas WHERE id::text = $${p} LIMIT 1)
                )
            `;
            params.push(area_id);
            p++;
        }

        query += ` ORDER BY v.fecha_entrada DESC`;
        
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
        marca_dispositivo, numero_serie, registrado_por_id,
        fecha_entrada, hora_salida
    } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO gh_visitas (
                nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
                contacto_emergencia, acuerdo_requisitos, contiene_equipos,
                marca_dispositivo, numero_serie, registrado_por_id,
                fecha_entrada, fecha_registro, hora_salida
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
            RETURNING *
        `, [
            nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
            contacto_emergencia, acuerdo_requisitos, contiene_equipos,
            marca_dispositivo, numero_serie, registrado_por_id,
            fecha_entrada || new Date(),
            hora_salida || null
        ]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        console.error('[GH-VISITAS] Save Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

export const getAreas = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(`SELECT id, nombre FROM gh_areas WHERE estado = 'ACTIVO' OR estado IS NULL ORDER BY nombre ASC`);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const saveVisitaPublic = async (req: Request, res: Response) => {
    const {
        nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
        contacto_emergencia, acuerdo_requisitos, contiene_equipos,
        marca_dispositivo, numero_serie, fecha_entrada
    } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO gh_visitas (
                nombre, cedula, area_dependencia, cuenta_arl, cuenta_eps,
                contacto_emergencia, acuerdo_requisitos, contiene_equipos,
                marca_dispositivo, numero_serie, registrado_por_id,
                fecha_entrada, fecha_registro
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'AUTOREGISTRO', $11, NOW())
            RETURNING id
        `, [
            nombre, cedula, area_dependencia,
            cuenta_arl === true || cuenta_arl === 'true',
            cuenta_eps === true || cuenta_eps === 'true',
            contacto_emergencia,
            acuerdo_requisitos === true || acuerdo_requisitos === 'true',
            contiene_equipos === true || contiene_equipos === 'true',
            marca_dispositivo || null, numero_serie || null,
            fecha_entrada || new Date()
        ]);
        res.json({ success: true, id: result.rows[0].id });
    } catch (err: any) {
        console.error('[GH-VISITAS-PUBLIC] Save Error:', err.message);
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
