import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

// Get elements list (for dropdowns, including es_serializado)
export const getElementosDropdown = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT e.id, e.nombre, e.es_serializado, e.estado_id, COALESCE(i.stock, 0) as stock
            FROM gh_elementos e
            LEFT JOIN gh_inventario_elemento i ON e.id = i.elemento_id
            WHERE e.estado_id = 'EST-01' 
            ORDER BY e.nombre ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching dropdown elements:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Purchase Orders (Ordenes de Compra)
export const getOrdenesCompra = async (req: Request, res: Response) => {
    const { id, fecha_inicio, fecha_fin, proveedor } = req.query;
    try {
        let query = `
            SELECT id, numero_orden, proveedor, fecha, estado, usuario_control, fecha_control 
            FROM gh_ordenes_compra
        `;
        
        const whereClause: string[] = [];
        const params: any[] = [];

        if (id) {
            whereClause.push(`id = $${params.length + 1}`);
            params.push(id);
        } else {
            if (fecha_inicio && fecha_fin) {
                whereClause.push(`fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(fecha_inicio, fecha_fin);
            } else {
                whereClause.push(`fecha >= CURRENT_DATE - INTERVAL '30 days'`);
            }
        }

        if (proveedor) {
            whereClause.push(`proveedor = $${params.length + 1}`);
            params.push(proveedor);
        }

        if (whereClause.length > 0) {
            query += ` WHERE ` + whereClause.join(' AND ');
        }

        query += ` ORDER BY id DESC`;
        const result = await pool.query(query, params);

        // Fetch details for each order
        const orders: any[] = [];
        for (const order of result.rows) {
            const detQuery = `
                SELECT d.id, d.elemento_id, d.cantidad, d.valor_unitario, e.nombre as elemento_nombre 
                FROM gh_ordenes_compra_detalle d
                LEFT JOIN gh_elementos e ON d.elemento_id = e.id
                WHERE d.orden_id = $1
            `;
            const details = await pool.query(detQuery, [order.id]);
            orders.push({ ...order, details: details.rows });
        }

        res.json({ success: true, data: orders });
    } catch (error: any) {
        console.error('Error fetching ordenes compra:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const createOrdenCompra = async (req: Request, res: Response) => {
    const { numero_orden, proveedor, fecha, items, usuario_control } = req.body;
    
    if (!numero_orden || !proveedor || !fecha || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check duplicate order number
        const check = await client.query('SELECT id FROM gh_ordenes_compra WHERE numero_orden = $1', [numero_orden]);
        if (check.rows.length > 0) {
            throw new Error(`La Orden de Compra #${numero_orden} ya existe.`);
        }

        const insOrder = `
            INSERT INTO gh_ordenes_compra (numero_orden, proveedor, fecha, estado, usuario_control) 
            VALUES ($1, $2, $3, 'PENDIENTE', $4) RETURNING *
        `;
        const resOrder = await client.query(insOrder, [numero_orden, proveedor, fecha, usuario_control]);
        const orderId = resOrder.rows[0].id;

        for (const item of items) {
            const insDetail = `
                INSERT INTO gh_ordenes_compra_detalle (orden_id, elemento_id, cantidad, valor_unitario) 
                VALUES ($1, $2, $3, $4)
            `;
            await client.query(insDetail, [orderId, item.elemento_id, item.cantidad, item.valor_unitario]);
        }

        await client.query('COMMIT');
        res.json({ success: true, data: resOrder.rows[0] });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating orden compra:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al guardar la orden de compra' });
    } finally {
        client.release();
    }
};

// Warehouse Entries (Entradas a Bodega)
export const getEntradasBodega = async (req: Request, res: Response) => {
    const { id, fecha_inicio, fecha_fin, proveedor } = req.query;
    try {
        let query = `
            SELECT e.id, e.numero_factura, e.orden_id, e.quien_recibio_id, e.fecha, e.observaciones, e.usuario_control, e.fecha_control,
                   e.proveedor,
                   oc.numero_orden as orden_numero,
                   COALESCE(pc_e.nombre, pc_oc.nombre, e.proveedor, oc.proveedor) as proveedor_nombre,
                   p.nombre as quien_recibio_nombre
            FROM gh_entradas_bodega e
            LEFT JOIN gh_ordenes_compra oc ON e.orden_id = oc.id
            LEFT JOIN prov_cliente pc_e ON e.proveedor = pc_e.documento
            LEFT JOIN prov_cliente pc_oc ON oc.proveedor = pc_oc.documento
            LEFT JOIN gh_personal p ON e.quien_recibio_id = p.id
        `;
        
        const whereClause: string[] = [];
        const params: any[] = [];

        if (id) {
            whereClause.push(`e.id = $${params.length + 1}`);
            params.push(id);
        } else {
            if (fecha_inicio && fecha_fin) {
                whereClause.push(`e.fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(fecha_inicio, fecha_fin);
            } else {
                whereClause.push(`e.fecha >= CURRENT_DATE - INTERVAL '30 days'`);
            }
        }

        if (proveedor) {
            // Can be commercial name or document
            whereClause.push(`(e.proveedor = $${params.length + 1} OR oc.proveedor = $${params.length + 1} OR pc_e.nombre = $${params.length + 1} OR pc_oc.nombre = $${params.length + 1})`);
            params.push(proveedor);
        }

        if (whereClause.length > 0) {
            query += ` WHERE ` + whereClause.join(' AND ');
        }

        query += ` ORDER BY e.id DESC`;
        const result = await pool.query(query, params);

        const entries: any[] = [];
        for (const entry of result.rows) {
            const detQuery = `
                SELECT d.id, d.elemento_id, d.cantidad, d.valor_unitario, e.nombre as elemento_nombre, e.es_serializado,
                       (SELECT ARRAY_AGG(serial) FROM gh_inventario_serial_elemento WHERE elemento_id = d.elemento_id AND entrada_id = d.entrada_id) as serials
                FROM gh_entradas_bodega_detalle d
                LEFT JOIN gh_elementos e ON d.elemento_id = e.id
                WHERE d.entrada_id = $1
            `;
            const details = await pool.query(detQuery, [entry.id]);
            entries.push({ ...entry, details: details.rows });
        }

        res.json({ success: true, data: entries });
    } catch (error: any) {
        console.error('Error fetching entradas bodega:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const createEntradaBodega = async (req: Request, res: Response) => {
    const { numero_factura, orden_id, quien_recibio_id, fecha, observaciones, items, usuario_control, proveedor, cerrar_orden } = req.body;

    if (!numero_factura || !fecha || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if invoice number is duplicate for safety
        const check = await client.query('SELECT id FROM gh_entradas_bodega WHERE numero_factura = $1 AND fecha = $2', [numero_factura, fecha]);
        if (check.rows.length > 0) {
            throw new Error(`La factura #${numero_factura} para esta fecha ya está registrada.`);
        }

        const insEntrada = `
            INSERT INTO gh_entradas_bodega (numero_factura, orden_id, quien_recibio_id, fecha, observaciones, usuario_control, proveedor) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `;
        const resEntrada = await client.query(insEntrada, [
            numero_factura, 
            orden_id || null, 
            quien_recibio_id ? Number(quien_recibio_id) : null,
            fecha, 
            observaciones, 
            usuario_control,
            proveedor || null
        ]);
        const entradaId = resEntrada.rows[0].id;

        for (const item of items) {
            // Insert detail
            const insDetail = `
                INSERT INTO gh_entradas_bodega_detalle (entrada_id, elemento_id, cantidad, valor_unitario) 
                VALUES ($1, $2, $3, $4)
            `;
            await client.query(insDetail, [entradaId, item.elemento_id, item.cantidad, item.valor_unitario]);

            // Update Stock in gh_inventario_elemento
            const checkStock = await client.query('SELECT id, stock FROM gh_inventario_elemento WHERE elemento_id = $1', [item.elemento_id]);
            if (checkStock.rows.length > 0) {
                await client.query('UPDATE gh_inventario_elemento SET stock = stock + $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE elemento_id = $2', [item.cantidad, item.elemento_id]);
            } else {
                await client.query('INSERT INTO gh_inventario_elemento (elemento_id, stock) VALUES ($1, $2)', [item.elemento_id, item.cantidad]);
            }

            // If elements are serialized, insert serial numbers
            if (item.es_serializado && item.serials && Array.isArray(item.serials)) {
                if (item.serials.length !== Number(item.cantidad)) {
                    throw new Error(`Debe ingresar exactamente ${item.cantidad} seriales para el elemento serializado.`);
                }

                for (const serial of item.serials) {
                    const rawSerial = serial.trim().toUpperCase();
                    if (!rawSerial) throw new Error('Los números de serial no pueden estar vacíos.');

                    // Check duplicate serial
                    const checkSerial = await client.query('SELECT id FROM gh_inventario_serial_elemento WHERE serial = $1', [rawSerial]);
                    if (checkSerial.rows.length > 0) {
                        throw new Error(`El serial "${rawSerial}" ya está registrado en el inventario.`);
                    }

                    const insSerial = `
                        INSERT INTO gh_inventario_serial_elemento (elemento_id, serial, estado_serial, entrada_id) 
                        VALUES ($1, $2, 'DISPONIBLE', $3)
                    `;
                    await client.query(insSerial, [item.elemento_id, rawSerial, entradaId]);
                }
            }
        }

        // If a purchase order was associated, update its state
        if (orden_id) {
            const targetEstado = cerrar_orden ? 'COMPLETADO' : 'PENDIENTE';
            await client.query("UPDATE gh_ordenes_compra SET estado = $1 WHERE id = $2", [targetEstado, orden_id]);
        }

        await client.query('COMMIT');
        res.json({ success: true, data: resEntrada.rows[0] });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating entrada bodega:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al guardar la entrada a bodega' });
    } finally {
        client.release();
    }
};

// Vendor Returns (Salidas a Proveedor)
export const getSalidasProveedor = async (req: Request, res: Response) => {
    const { id, fecha_inicio, fecha_fin, proveedor } = req.query;
    try {
        let query = `
            SELECT s.id, s.numero_salida, s.proveedor, s.fecha, s.observaciones, s.usuario_control, s.fecha_control,
                   COALESCE(pc.nombre, s.proveedor) as proveedor_nombre
            FROM gh_salidas_proveedor s
            LEFT JOIN prov_cliente pc ON s.proveedor = pc.documento
        `;
        
        const whereClause: string[] = [];
        const params: any[] = [];

        if (id) {
            whereClause.push(`s.id = $${params.length + 1}`);
            params.push(id);
        } else {
            if (fecha_inicio && fecha_fin) {
                whereClause.push(`s.fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(fecha_inicio, fecha_fin);
            } else {
                whereClause.push(`s.fecha >= CURRENT_DATE - INTERVAL '30 days'`);
            }
        }

        if (proveedor) {
            whereClause.push(`(s.proveedor = $${params.length + 1} OR pc.nombre = $${params.length + 1})`);
            params.push(proveedor);
        }

        if (whereClause.length > 0) {
            query += ` WHERE ` + whereClause.join(' AND ');
        }

        query += ` ORDER BY s.id DESC`;
        const result = await pool.query(query, params);

        const returns: any[] = [];
        for (const ret of result.rows) {
            const detQuery = `
                SELECT d.id, d.elemento_id, d.cantidad, d.valor_unitario, e.nombre as elemento_nombre, e.es_serializado
                FROM gh_salidas_proveedor_detalle d
                LEFT JOIN gh_elementos e ON d.elemento_id = e.id
                WHERE d.salida_id = $1
            `;
            const details = await pool.query(detQuery, [ret.id]);
            returns.push({ ...ret, details: details.rows });
        }

        res.json({ success: true, data: returns });
    } catch (error: any) {
        console.error('Error fetching salidas proveedor:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const createSalidaProveedor = async (req: Request, res: Response) => {
    const { numero_salida, proveedor, fecha, observaciones, items, usuario_control } = req.body;

    if (!numero_salida || !proveedor || !fecha || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check duplicate return number
        const check = await client.query('SELECT id FROM gh_salidas_proveedor WHERE numero_salida = $1', [numero_salida]);
        if (check.rows.length > 0) {
            throw new Error(`La salida a proveedor #${numero_salida} ya existe.`);
        }

        const insSalida = `
            INSERT INTO gh_salidas_proveedor (numero_salida, proveedor, fecha, observaciones, usuario_control) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const resSalida = await client.query(insSalida, [numero_salida, proveedor, fecha, observaciones, usuario_control]);
        const salidaId = resSalida.rows[0].id;

        for (const item of items) {
            // Check stock availability with exclusive lock (FOR UPDATE) to prevent concurrency race conditions
            const stockCheck = await client.query('SELECT stock FROM gh_inventario_elemento WHERE elemento_id = $1 FOR UPDATE', [item.elemento_id]);
            const currentStock = stockCheck.rows.length > 0 ? stockCheck.rows[0].stock : 0;
            
            if (currentStock < Number(item.cantidad)) {
                throw new Error(`Stock insuficiente para el elemento ID ${item.elemento_id}. Stock disponible: ${currentStock}, Solicitado: ${item.cantidad}`);
            }

            // Insert detail
            const insDetail = `
                INSERT INTO gh_salidas_proveedor_detalle (salida_id, elemento_id, cantidad, valor_unitario) 
                VALUES ($1, $2, $3, $4)
            `;
            await client.query(insDetail, [salidaId, item.elemento_id, item.cantidad, item.valor_unitario]);

            // Decrement Stock
            await client.query('UPDATE gh_inventario_elemento SET stock = stock - $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE elemento_id = $2', [item.cantidad, item.elemento_id]);

            // Handle Serials if applicable
            if (item.es_serializado && item.serials && Array.isArray(item.serials)) {
                if (item.serials.length !== Number(item.cantidad)) {
                    throw new Error(`Debe seleccionar exactamente ${item.cantidad} seriales para el elemento serializado.`);
                }

                for (const serial of item.serials) {
                    const rawSerial = serial.trim().toUpperCase();
                    // Verify if this serial exists and is AVAILABLE with exclusive lock (FOR UPDATE)
                    const checkSerial = await client.query('SELECT id, estado_serial FROM gh_inventario_serial_elemento WHERE serial = $1 AND elemento_id = $2 FOR UPDATE', [rawSerial, item.elemento_id]);
                    if (checkSerial.rows.length === 0) {
                        throw new Error(`El serial "${rawSerial}" no existe en el inventario para este elemento.`);
                    }
                    if (checkSerial.rows[0].estado_serial !== 'DISPONIBLE') {
                        throw new Error(`El serial "${rawSerial}" no está disponible (Estado actual: ${checkSerial.rows[0].estado_serial}).`);
                    }

                    // Update serial state
                    await client.query("UPDATE gh_inventario_serial_elemento SET estado_serial = 'DEVUELTO_PROVEEDOR' WHERE serial = $1", [rawSerial]);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, data: resSalida.rows[0] });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating salida proveedor:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al guardar la salida a proveedor' });
    } finally {
        client.release();
    }
};

// Fetch available serial numbers for a given element
export const getAvailableSerials = async (req: Request, res: Response) => {
    const { elemento_id } = req.params;
    try {
        const query = `
            SELECT id, serial, estado_serial 
            FROM gh_inventario_serial_elemento 
            WHERE elemento_id = $1 AND estado_serial = 'DISPONIBLE'
            ORDER BY serial ASC
        `;
        const result = await pool.query(query, [elemento_id]);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching available serials:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// --- PERSONAL ASSIGNMENTS & RETURNS ---

// List personal assignments
export const getAsignaciones = async (req: Request, res: Response) => {
    const { id, fecha_inicio, fecha_fin, personal_id } = req.query;
    try {
        let query = `
            SELECT a.id, a.numero_asignacion, a.personal_id, a.autorizado_por, a.fecha, a.observaciones, a.usuario_control, a.fecha_control,
                   COALESCE(a.firma_estado, 'PENDIENTE') as firma_estado, a.fecha_firma, a.firmado_por,
                   p.nombre as personal_nombre, p.cedula as personal_documento
            FROM gh_asignaciones_personal a
            LEFT JOIN gh_personal p ON a.personal_id = p.id
        `;
        const whereClause: string[] = [];
        const params: any[] = [];

        if (id) {
            whereClause.push(`a.id = $${params.length + 1}`);
            params.push(id);
        } else {
            if (fecha_inicio && fecha_fin) {
                whereClause.push(`a.fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(fecha_inicio, fecha_fin);
            } else {
                whereClause.push(`a.fecha >= CURRENT_DATE - INTERVAL '30 days'`);
            }
        }

        if (personal_id) {
            whereClause.push(`a.personal_id = $${params.length + 1}`);
            params.push(Number(personal_id));
        }

        if (whereClause.length > 0) {
            query += ` WHERE ` + whereClause.join(' AND ');
        }

        query += ` ORDER BY a.id DESC`;
        const result = await pool.query(query, params);

        const assignments: any[] = [];
        for (const row of result.rows) {
            const detQuery = `
                SELECT d.id, d.elemento_id, d.cantidad, e.nombre as elemento_nombre, e.es_serializado,
                       (SELECT ARRAY_AGG(serial) FROM gh_inventario_serial_elemento WHERE elemento_id = d.elemento_id AND personal_id = $2 AND estado_serial = 'ASIGNADO') as serials
                FROM gh_asignaciones_personal_detalle d
                LEFT JOIN gh_elementos e ON d.elemento_id = e.id
                WHERE d.asignacion_id = $1
            `;
            const details = await pool.query(detQuery, [row.id, row.personal_id]);
            assignments.push({ ...row, details: details.rows });
        }

        res.json({ success: true, data: assignments });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Create personal assignment
export const createAsignacionPersonal = async (req: Request, res: Response) => {
    const { numero_asignacion, personal_id, autorizado_por, fecha, observaciones, items, usuario_control } = req.body;

    if (!numero_asignacion || !personal_id || !autorizado_por || !fecha || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check duplicate assignment number
        const check = await client.query('SELECT id FROM gh_asignaciones_personal WHERE numero_asignacion = $1', [numero_asignacion]);
        if (check.rows.length > 0) {
            throw new Error(`La Asignación #${numero_asignacion} ya existe.`);
        }

        const insAsignacion = `
            INSERT INTO gh_asignaciones_personal (numero_asignacion, personal_id, autorizado_por, fecha, observaciones, usuario_control) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        const resAsignacion = await client.query(insAsignacion, [
            numero_asignacion, 
            Number(personal_id), 
            autorizado_por, 
            fecha, 
            observaciones, 
            usuario_control
        ]);
        const asignacionId = resAsignacion.rows[0].id;

        for (const item of items) {
            // Lock warehouse stock
            await client.query('SELECT id FROM gh_inventario_elemento WHERE elemento_id = $1 FOR UPDATE', [item.elemento_id]);

            // Get current stock
            const stockCheck = await client.query('SELECT stock FROM gh_inventario_elemento WHERE elemento_id = $1', [item.elemento_id]);
            const currentStock = stockCheck.rows.length > 0 ? stockCheck.rows[0].stock : 0;

            if (currentStock < item.cantidad) {
                throw new Error(`Stock insuficiente en bodega para el elemento solicitado. Disponible: ${currentStock}, Solicitado: ${item.cantidad}`);
            }

            // Insert detail
            const insDetailSql = `
                INSERT INTO gh_asignaciones_personal_detalle (asignacion_id, elemento_id, cantidad) 
                VALUES ($1, $2, $3)
            `;
            await client.query(insDetailSql, [asignacionId, item.elemento_id, item.cantidad]);

            // Update Warehouse Stock
            await client.query('UPDATE gh_inventario_elemento SET stock = stock - $1 WHERE elemento_id = $2', [item.cantidad, item.elemento_id]);

            // Update Personal Stock (Upsert)
            const persCheck = await client.query('SELECT id FROM gh_inventario_personal WHERE personal_id = $1 AND elemento_id = $2 FOR UPDATE', [Number(personal_id), item.elemento_id]);
            if (persCheck.rows.length > 0) {
                await client.query('UPDATE gh_inventario_personal SET stock = stock + $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE personal_id = $2 AND elemento_id = $3', [item.cantidad, Number(personal_id), item.elemento_id]);
            } else {
                await client.query('INSERT INTO gh_inventario_personal (personal_id, elemento_id, stock) VALUES ($1, $2, $3)', [Number(personal_id), item.elemento_id, item.cantidad]);
            }

            // Handle Serials
            if (item.serials && Array.isArray(item.serials) && item.serials.length > 0) {
                if (item.serials.length !== item.cantidad) {
                    throw new Error(`La cantidad de seriales (${item.serials.length}) no coincide con la cantidad asignada (${item.cantidad}).`);
                }

                for (const serial of item.serials) {
                    const rawSerial = serial.trim().toUpperCase();
                    // Verify if this serial exists and is AVAILABLE with exclusive lock
                    const checkSerial = await client.query('SELECT id, estado_serial FROM gh_inventario_serial_elemento WHERE serial = $1 AND elemento_id = $2 FOR UPDATE', [rawSerial, item.elemento_id]);
                    if (checkSerial.rows.length === 0) {
                        throw new Error(`El serial "${rawSerial}" no existe en el inventario.`);
                    }
                    if (checkSerial.rows[0].estado_serial !== 'DISPONIBLE') {
                        throw new Error(`El serial "${rawSerial}" no está disponible (Estado actual: ${checkSerial.rows[0].estado_serial}).`);
                    }

                    // Update serial state to ASIGNADO to this person
                    await client.query(
                        "UPDATE gh_inventario_serial_elemento SET estado_serial = 'ASIGNADO', personal_id = $1, fecha_asignacion = CURRENT_TIMESTAMP WHERE serial = $2", 
                        [Number(personal_id), rawSerial]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, data: resAsignacion.rows[0] });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating assignment:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al guardar la asignación' });
    } finally {
        client.release();
    }
};

// List personal returns
export const getDevoluciones = async (req: Request, res: Response) => {
    const { id, fecha_inicio, fecha_fin, personal_id } = req.query;
    try {
        let query = `
            SELECT d.id, d.numero_devolucion, d.personal_id, d.motivo, d.fecha, d.usuario_control, d.fecha_control,
                   COALESCE(d.firma_estado, 'PENDIENTE') as firma_estado, d.fecha_firma, d.firmado_por,
                   p.nombre as personal_nombre, p.cedula as personal_documento
            FROM gh_devoluciones_personal d
            LEFT JOIN gh_personal p ON d.personal_id = p.id
        `;
        const whereClause: string[] = [];
        const params: any[] = [];

        if (id) {
            whereClause.push(`d.id = $${params.length + 1}`);
            params.push(id);
        } else {
            if (fecha_inicio && fecha_fin) {
                whereClause.push(`d.fecha BETWEEN $${params.length + 1} AND $${params.length + 2}`);
                params.push(fecha_inicio, fecha_fin);
            } else {
                whereClause.push(`d.fecha >= CURRENT_DATE - INTERVAL '30 days'`);
            }
        }

        if (personal_id) {
            whereClause.push(`d.personal_id = $${params.length + 1}`);
            params.push(Number(personal_id));
        }

        if (whereClause.length > 0) {
            query += ` WHERE ` + whereClause.join(' AND ');
        }

        query += ` ORDER BY d.id DESC`;
        const result = await pool.query(query, params);

        const returns: any[] = [];
        for (const row of result.rows) {
            const detQuery = `
                SELECT d.id, d.elemento_id, d.cantidad, e.nombre as elemento_nombre, e.es_serializado,
                       (SELECT ARRAY_AGG(serial) FROM gh_inventario_serial_elemento WHERE elemento_id = d.elemento_id AND personal_id = $2 AND estado_serial = 'DISPONIBLE') as serials
                FROM gh_devoluciones_personal_detalle d
                LEFT JOIN gh_elementos e ON d.elemento_id = e.id
                WHERE d.devolucion_id = $1
            `; // Wait, let's keep details standard and not search returning serials if not tracked in returns detail, but we can query them anyway!
            const details = await pool.query(detQuery, [row.id, row.personal_id]);
            returns.push({ ...row, details: details.rows });
        }

        res.json({ success: true, data: returns });
    } catch (error) {
        console.error('Error fetching returns:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Create personal return
export const createDevolucionPersonal = async (req: Request, res: Response) => {
    const { numero_devolucion, personal_id, motivo, fecha, items, usuario_control } = req.body;

    if (!numero_devolucion || !personal_id || !motivo || !fecha || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check duplicate return number
        const check = await client.query('SELECT id FROM gh_devoluciones_personal WHERE numero_devolucion = $1', [numero_devolucion]);
        if (check.rows.length > 0) {
            throw new Error(`La Devolución #${numero_devolucion} ya existe.`);
        }

        // Check if the person doing the movement IS the personal (implicit signature)
        const personalCheck = await client.query(
            `SELECT nombre, cedula FROM gh_personal WHERE id = $1`, [Number(personal_id)]
        );
        const personalDoc = personalCheck.rows[0]?.cedula || '';
        const isSamePerson = usuario_control && personalCheck.rows[0]?.nombre &&
            (usuario_control.toLowerCase().includes(personalCheck.rows[0].nombre.toLowerCase().split(' ')[0]) ||
             usuario_control === personalDoc);

        const insDevolucion = `
            INSERT INTO gh_devoluciones_personal (numero_devolucion, personal_id, motivo, fecha, usuario_control,
                firma_estado, fecha_firma, firmado_por)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `;
        const resDevolucion = await client.query(insDevolucion, [
            numero_devolucion,
            Number(personal_id),
            motivo,
            fecha,
            usuario_control,
            isSamePerson ? 'FIRMADO' : 'PENDIENTE',
            isSamePerson ? new Date() : null,
            isSamePerson ? usuario_control : null,
        ]);
        const devolucionId = resDevolucion.rows[0].id;

        for (const item of items) {
            // Lock personal stock
            await client.query('SELECT id FROM gh_inventario_personal WHERE personal_id = $1 AND elemento_id = $2 FOR UPDATE', [Number(personal_id), item.elemento_id]);

            // Get current personal stock
            const stockCheck = await client.query('SELECT stock FROM gh_inventario_personal WHERE personal_id = $1 AND elemento_id = $2', [Number(personal_id), item.elemento_id]);
            const currentStock = stockCheck.rows.length > 0 ? stockCheck.rows[0].stock : 0;

            if (currentStock < item.cantidad) {
                throw new Error(`El personal no posee suficiente stock de este elemento. Disponible: ${currentStock}, Solicitado a devolver: ${item.cantidad}`);
            }

            // Insert detail
            const insDetail = `
                INSERT INTO gh_devoluciones_personal_detalle (devolucion_id, elemento_id, cantidad) 
                VALUES ($1, $2, $3)
            `;
            await client.query(insDetail, [devolucionId, item.elemento_id, item.cantidad]);

            // Update Personal Stock
            await client.query('UPDATE gh_inventario_personal SET stock = stock - $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE personal_id = $2 AND elemento_id = $3', [item.cantidad, Number(personal_id), item.elemento_id]);

            // Update Warehouse Stock (Upsert)
            const whCheck = await client.query('SELECT id FROM gh_inventario_elemento WHERE elemento_id = $1 FOR UPDATE', [item.elemento_id]);
            if (whCheck.rows.length > 0) {
                await client.query('UPDATE gh_inventario_elemento SET stock = stock + $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE elemento_id = $2', [item.cantidad, item.elemento_id]);
            } else {
                await client.query('INSERT INTO gh_inventario_elemento (elemento_id, stock) VALUES ($1, $2)', [item.elemento_id, item.cantidad]);
            }

            // Handle Serials
            if (item.serials && Array.isArray(item.serials) && item.serials.length > 0) {
                if (item.serials.length !== item.cantidad) {
                    throw new Error(`La cantidad de seriales (${item.serials.length}) no coincide con la cantidad a devolver (${item.cantidad}).`);
                }

                for (const serial of item.serials) {
                    const rawSerial = serial.trim().toUpperCase();
                    // Verify if this serial exists and is ASIGNADO to this person
                    const checkSerial = await client.query('SELECT id, estado_serial, personal_id FROM gh_inventario_serial_elemento WHERE serial = $1 AND elemento_id = $2 FOR UPDATE', [rawSerial, item.elemento_id]);
                    if (checkSerial.rows.length === 0) {
                        throw new Error(`El serial "${rawSerial}" no existe en el inventario.`);
                    }
                    if (checkSerial.rows[0].estado_serial !== 'ASIGNADO' || Number(checkSerial.rows[0].personal_id) !== Number(personal_id)) {
                        throw new Error(`El serial "${rawSerial}" no está asignado a esta persona.`);
                    }

                    // Update serial state back to DISPONIBLE and remove association
                    await client.query(
                        "UPDATE gh_inventario_serial_elemento SET estado_serial = 'DISPONIBLE', personal_id = NULL, fecha_asignacion = NULL WHERE serial = $1", 
                        [rawSerial]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, data: resDevolucion.rows[0] });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating return:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al guardar la devolución' });
    } finally {
        client.release();
    }
};

// Get inventory elements assigned to a specific person
export const getPersonalInventario = async (req: Request, res: Response) => {
    const { personal_id } = req.params;
    try {
        const query = `
            SELECT ip.elemento_id, ip.stock, e.nombre as elemento_nombre, e.es_serializado
            FROM gh_inventario_personal ip
            LEFT JOIN gh_elementos e ON ip.elemento_id = e.id
            WHERE ip.personal_id = $1 AND ip.stock > 0
            ORDER BY e.nombre ASC
        `;
        const result = await pool.query(query, [Number(personal_id)]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching personal inventory:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Sign an assignment (firma digital)
export const firmarAsignacion = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { clave_firma, firmado_por } = req.body;

    if (!clave_firma) {
        return res.status(400).json({ success: false, error: 'Ingrese la clave de firma.' });
    }

    try {
        // Get the assignment and the personal's document number
        const asigCheck = await pool.query(
            `SELECT a.id, a.firma_estado, p.cedula as personal_documento, p.nombre as personal_nombre
             FROM gh_asignaciones_personal a
             JOIN gh_personal p ON a.personal_id = p.id
             WHERE a.id = $1`,
            [Number(id)]
        );
        if (asigCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Asignación no encontrada.' });
        }
        const asig = asigCheck.rows[0];
        if (asig.firma_estado === 'FIRMADO') {
            return res.status(400).json({ success: false, error: 'Esta asignación ya fue firmada.' });
        }

        const personalDocumento = asig.personal_documento;

        // Lookup: gh_personal.cedula → users.document_number → users.id → digital_signatures.idusuario
        const sigResult = await pool.query(
            `SELECT ds.pasword, ds.aprobada
             FROM users u
             JOIN digital_signatures ds ON ds.idusuario = u.id
             WHERE u.document_number = $1
             LIMIT 1`,
            [personalDocumento]
        );
        if (sigResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: `El funcionario "${asig.personal_nombre}" no tiene firma digital registrada.` });
        }
        if (!sigResult.rows[0].aprobada) {
            return res.status(400).json({ success: false, error: `La firma digital de "${asig.personal_nombre}" no está aprobada. Contacte al administrador.` });
        }

        // Validate key against the personal's bcrypt hash
        const claveValida = await bcrypt.compare(clave_firma, sigResult.rows[0].pasword);
        if (!claveValida) {
            return res.status(400).json({ success: false, error: 'Clave de firma incorrecta. Recuerde que es la clave de su firma digital, no la de inicio de sesión.' });
        }

        // Apply signature, store who triggered it
        await pool.query(
            `UPDATE gh_asignaciones_personal SET firma_estado = 'FIRMADO', fecha_firma = NOW(), firmado_por = $1 WHERE id = $2`,
            [firmado_por || personalDocumento, Number(id)]
        );

        res.json({ success: true, message: `Asignación firmada por ${asig.personal_nombre}.` });
    } catch (error: any) {
        console.error('Error firmando asignación:', error);
        res.status(500).json({ success: false, error: 'Error del servidor al firmar.' });
    }
};

// Sign a return (firma digital devolución)
export const firmarDevolucion = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { clave_firma, firmado_por } = req.body;

    if (!clave_firma) {
        return res.status(400).json({ success: false, error: 'Ingrese la clave de firma.' });
    }

    try {
        const devCheck = await pool.query(
            `SELECT d.id, d.firma_estado, p.cedula as personal_documento, p.nombre as personal_nombre
             FROM gh_devoluciones_personal d
             JOIN gh_personal p ON d.personal_id = p.id
             WHERE d.id = $1`,
            [Number(id)]
        );
        if (devCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Devolución no encontrada.' });
        }
        const dev = devCheck.rows[0];
        if (dev.firma_estado === 'FIRMADO') {
            return res.status(400).json({ success: false, error: 'Esta devolución ya fue firmada.' });
        }

        // Lookup: gh_personal.cedula → users.document_number → users.id → digital_signatures.idusuario
        const sigResult = await pool.query(
            `SELECT ds.pasword, ds.aprobada
             FROM users u
             JOIN digital_signatures ds ON ds.idusuario = u.id
             WHERE u.document_number = $1
             LIMIT 1`,
            [dev.personal_documento]
        );
        if (sigResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: `"${dev.personal_nombre}" no tiene firma digital registrada.` });
        }
        if (!sigResult.rows[0].aprobada) {
            return res.status(400).json({ success: false, error: `La firma de "${dev.personal_nombre}" no está aprobada.` });
        }

        const claveValidaDev = await bcrypt.compare(clave_firma, sigResult.rows[0].pasword);
        if (!claveValidaDev) {
            return res.status(400).json({ success: false, error: 'Clave de firma incorrecta. Recuerde que es la clave de su firma digital, no la de inicio de sesión.' });
        }

        await pool.query(
            `UPDATE gh_devoluciones_personal SET firma_estado = 'FIRMADO', fecha_firma = NOW(), firmado_por = $1 WHERE id = $2`,
            [firmado_por || dev.personal_documento, Number(id)]
        );

        res.json({ success: true, message: `Devolución firmada por ${dev.personal_nombre}.` });
    } catch (error: any) {
        console.error('Error firmando devolución:', error);
        res.status(500).json({ success: false, error: 'Error del servidor al firmar.' });
    }
};

// Get personal assigned serials for a given element
export const getPersonalSerials = async (req: Request, res: Response) => {
    const { personal_id, elemento_id } = req.params;
    try {
        const query = `
            SELECT id, serial, estado_serial
            FROM gh_inventario_serial_elemento
            WHERE elemento_id = $1 AND personal_id = $2 AND estado_serial = 'ASIGNADO'
            ORDER BY serial ASC
        `;
        const result = await pool.query(query, [elemento_id, Number(personal_id)]);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching personal serials:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const getInventarioBodega = async (req: Request, res: Response) => {
    const { elemento_id } = req.query;
    try {
        let query = `
            SELECT e.id as elemento_id, e.nombre as elemento_nombre, e.es_serializado,
                   t.nombre as tipo_nombre,
                   COALESCE(ie.stock, 0) as stock
            FROM gh_elementos e
            LEFT JOIN gh_tipos_elementos t ON e.tipo_id = t.id
            LEFT JOIN gh_inventario_elemento ie ON ie.elemento_id = e.id
            WHERE e.estado_id = 'EST-01'
        `;
        const params: any[] = [];
        if (elemento_id) {
            params.push(Number(elemento_id));
            query += ` AND e.id = $${params.length}`;
        }
        query += ` ORDER BY e.nombre ASC`;
        const result = await pool.query(query, params);

        // For serialized elements, get serial list
        const rows: any[] = [];
        for (const row of result.rows) {
            let serials: any[] = [];
            if (row.es_serializado) {
                const sRes = await pool.query(
                    `SELECT serial, estado_serial,
                            CASE WHEN personal_id IS NOT NULL THEN (SELECT nombre FROM gh_personal WHERE id = personal_id) ELSE NULL END as asignado_a
                     FROM gh_inventario_serial_elemento
                     WHERE elemento_id = $1
                     ORDER BY estado_serial, serial ASC`,
                    [row.elemento_id]
                );
                serials = sRes.rows;
            }
            rows.push({ ...row, serials });
        }
        res.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error fetching inventario bodega:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const getInventarioPersonal = async (req: Request, res: Response) => {
    const { personal_id, elemento_id } = req.query;
    try {
        let query = `
            SELECT ip.personal_id, ip.elemento_id, ip.stock,
                   p.nombre as personal_nombre, p.cedula as personal_documento,
                   p.cargo, p.area_trabajo_id,
                   e.nombre as elemento_nombre, e.es_serializado,
                   t.nombre as tipo_nombre
            FROM gh_inventario_personal ip
            JOIN gh_personal p ON ip.personal_id = p.id
            JOIN gh_elementos e ON ip.elemento_id = e.id
            LEFT JOIN gh_tipos_elementos t ON e.tipo_id = t.id
            WHERE ip.stock > 0
        `;
        const params: any[] = [];
        if (personal_id) {
            params.push(Number(personal_id));
            query += ` AND ip.personal_id = $${params.length}`;
        }
        if (elemento_id) {
            params.push(Number(elemento_id));
            query += ` AND ip.elemento_id = $${params.length}`;
        }
        query += ` ORDER BY p.nombre ASC, e.nombre ASC`;
        const result = await pool.query(query, params);

        // For serialized elements, get assigned serials
        const rows: any[] = [];
        for (const row of result.rows) {
            let serials: any[] = [];
            if (row.es_serializado) {
                const sRes = await pool.query(
                    `SELECT serial, estado_serial, fecha_asignacion
                     FROM gh_inventario_serial_elemento
                     WHERE elemento_id = $1 AND personal_id = $2 AND estado_serial = 'ASIGNADO'
                     ORDER BY serial ASC`,
                    [row.elemento_id, row.personal_id]
                );
                serials = sRes.rows;
            }
            rows.push({ ...row, serials });
        }
        res.json({ success: true, data: rows });
    } catch (error: any) {
        console.error('Error fetching inventario personal:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

