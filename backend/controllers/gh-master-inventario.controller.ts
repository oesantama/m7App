import { Request, Response } from 'express';
import pool from '../config/database.js';

// TIPOS DE ELEMENTOS
export const getTiposElementos = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT id, nombre, estado_id, usuario_control, fecha_control 
            FROM gh_tipos_elementos 
            ORDER BY id DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching tipos elementos:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const createTipoElemento = async (req: Request, res: Response) => {
    const { nombre, estado_id, usuario_control } = req.body;
    try {
        const check = await pool.query('SELECT id FROM gh_tipos_elementos WHERE nombre = $1', [nombre]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'El nombre ya existe.' });
        }
        
        const query = `
            INSERT INTO gh_tipos_elementos (nombre, estado_id, usuario_control) 
            VALUES ($1, $2, $3) RETURNING *
        `;
        const result = await pool.query(query, [nombre, estado_id, usuario_control]);
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error creating tipo elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const updateTipoElemento = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nombre, estado_id, usuario_control } = req.body;
    try {
        const check = await pool.query('SELECT id FROM gh_tipos_elementos WHERE nombre = $1 AND id != $2', [nombre, id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'El nombre ya existe.' });
        }
        
        const query = `
            UPDATE gh_tipos_elementos 
            SET nombre = $1, estado_id = $2, usuario_control = $3, fecha_control = CURRENT_TIMESTAMP 
            WHERE id = $4 RETURNING *
        `;
        const result = await pool.query(query, [nombre, estado_id, usuario_control, id]);
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error updating tipo elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const deleteTipoElemento = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const check = await pool.query('SELECT id FROM gh_elementos WHERE tipo_id = $1', [id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'No se puede eliminar, tiene elementos asociados.' });
        }
        
        await pool.query('DELETE FROM gh_tipos_elementos WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting tipo elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ELEMENTOS
export const getElementos = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT e.id, e.nombre, e.tipo_id, e.estado_id, e.usuario_control, e.fecha_control, e.es_serializado, t.nombre as tipo_nombre,
                   EXISTS(
                       SELECT 1 FROM gh_inventario_elemento WHERE elemento_id = e.id AND stock > 0
                       UNION ALL
                       SELECT 1 FROM gh_ordenes_compra_detalle WHERE elemento_id = e.id
                       UNION ALL
                       SELECT 1 FROM gh_entradas_bodega_detalle WHERE elemento_id = e.id
                       UNION ALL
                       SELECT 1 FROM gh_salidas_proveedor_detalle WHERE elemento_id = e.id
                   ) as tiene_movimientos
            FROM gh_elementos e
            LEFT JOIN gh_tipos_elementos t ON e.tipo_id = t.id
            ORDER BY e.id DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching elementos:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const createElemento = async (req: Request, res: Response) => {
    const { nombre, tipo_id, estado_id, usuario_control, es_serializado } = req.body;
    try {
        const check = await pool.query('SELECT id FROM gh_elementos WHERE nombre = $1', [nombre]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'El nombre ya existe.' });
        }
        
        const query = `
            INSERT INTO gh_elementos (nombre, tipo_id, estado_id, usuario_control, es_serializado) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const result = await pool.query(query, [nombre, tipo_id, estado_id, usuario_control, es_serializado || false]);
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error creating elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const updateElemento = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nombre, tipo_id, estado_id, usuario_control, es_serializado } = req.body;
    try {
        const check = await pool.query('SELECT id FROM gh_elementos WHERE nombre = $1 AND id != $2', [nombre, id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'El nombre ya existe.' });
        }

        // Safety check: verify if the user is trying to toggle the es_serializado property
        const currentRes = await pool.query('SELECT es_serializado FROM gh_elementos WHERE id = $1', [id]);
        if (currentRes.rows.length > 0 && currentRes.rows[0].es_serializado !== es_serializado) {
            // Check stock > 0
            const stockCheck = await pool.query('SELECT stock FROM gh_inventario_elemento WHERE elemento_id = $1 AND stock > 0', [id]);
            if (stockCheck.rows.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No se puede cambiar el tipo de serialización porque el elemento ya tiene saldo en inventario.' 
                });
            }

            // Check movements in details
            const movCheck = await pool.query(`
                SELECT id FROM gh_ordenes_compra_detalle WHERE elemento_id = $1
                UNION ALL
                SELECT id FROM gh_entradas_bodega_detalle WHERE elemento_id = $1
                UNION ALL
                SELECT id FROM gh_salidas_proveedor_detalle WHERE elemento_id = $1
                LIMIT 1
            `, [id]);

            if (movCheck.rows.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No se puede cambiar el tipo de serialización porque el elemento ya registra movimientos en compras, entradas o salidas.' 
                });
            }
        }
        
        const query = `
            UPDATE gh_elementos 
            SET nombre = $1, tipo_id = $2, estado_id = $3, usuario_control = $4, es_serializado = $5, fecha_control = CURRENT_TIMESTAMP 
            WHERE id = $6 RETURNING *
        `;
        const result = await pool.query(query, [nombre, tipo_id, estado_id, usuario_control, es_serializado || false, id]);
        res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('Error updating elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const deleteElemento = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM gh_elementos WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting elemento:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
