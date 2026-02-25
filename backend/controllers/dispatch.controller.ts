
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
        const insertRes = await pool.query(`
            INSERT INTO dispatch_assignments (
                invoice_id, driver_id, helper_ids, scanned_items, 
                is_accompanied, helper_count, status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [
            invoiceId, driverId, JSON.stringify(helperIds || []), 
            JSON.stringify(scannedItems || []), isAccompanied, helperCount, 
            'PENDING_SIGNATURES', createdBy
        ]);

        const dispatchId = insertRes.rows[0].id;

        // 2. Procesar firmas (Inmediatas y Pendientes)
        for (const sig of (signatures || [])) {
            let isSigned = false;
            let signedAt: Date | null = null;

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
            SET item_status = 'EST-11'
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
            JOIN dispatch_assignments da ON dsp.dispatch_id::integer = da.id
            WHERE dsp.user_id = $1 AND dsp.signed = false
            ORDER BY da.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ─── INICIALIZACIÓN DE TABLAS ─────────────────────────────────────────────────
// Se llama 1 vez al arrancar para garantizar que las tablas de entrega existen.
export const initDeliveryTables = async () => {
    console.log('[M7-DISPATCH] initDeliveryTables: Iniciando proceso...');
    try {
        console.log('[M7-DISPATCH] initDeliveryTables: Ejecutando pool.query...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS delivery_confirmations (
                id          SERIAL PRIMARY KEY,
                dispatch_id TEXT,
                invoice_id  TEXT NOT NULL,
                driver_id   TEXT NOT NULL,
                vehicle_id  TEXT,
                delivery_type TEXT NOT NULL CHECK (delivery_type IN ('FULL','PARTIAL','RETURN')),
                delivered_items JSONB DEFAULT '[]',
                notes       TEXT,
                delivered_at TIMESTAMPTZ DEFAULT NOW(),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS delivery_returns (
                id          SERIAL PRIMARY KEY,
                confirmation_id INTEGER REFERENCES delivery_confirmations(id) ON DELETE SET NULL,
                invoice_id  TEXT NOT NULL,
                driver_id   TEXT NOT NULL,
                vehicle_id  TEXT,
                return_reason TEXT,
                notes       TEXT,
                status      TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','CANCELLED')),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS delivery_return_items (
                id                  SERIAL PRIMARY KEY,
                return_id           INTEGER NOT NULL REFERENCES delivery_returns(id) ON DELETE CASCADE,
                sku                 TEXT,
                article_name        TEXT,
                quantity_returned   INTEGER NOT NULL DEFAULT 0,
                quantity_delivered  INTEGER NOT NULL DEFAULT 0,
                unit                TEXT,
                notes               TEXT
            );
        `);
        console.log('[M7-DISPATCH] initDeliveryTables: Tablas verificadas/creadas correctamente.');
    } catch (err: any) {
        console.error('[M7-DISPATCH] initDeliveryTables: ERROR CRÍTICO:', err.message);
        console.error(err.stack);
    }
};

// ─── CONFIRMAR ENTREGA AL CLIENTE ─────────────────────────────────────────────
/**
 * POST /api/dispatch/confirm-delivery
 * Body: {
 *   invoiceId, dispatchId?, driverId, vehicleId?,
 *   deliveryType: 'FULL' | 'PARTIAL' | 'RETURN',
 *   deliveredItems: [{ sku, articleName, quantityDelivered, quantityReturned, unit, notes }],
 *   notes?, returnReason?, password
 * }
 */
export const confirmDelivery = async (req: Request, res: Response) => {
    const {
        invoiceId, dispatchId, driverId, vehicleId,
        deliveryType, deliveredItems = [], notes, returnReason, password
    } = req.body;

    if (!invoiceId || !driverId || !deliveryType || !password) {
        return res.status(400).json({ error: 'Faltan campos requeridos: invoiceId, driverId, deliveryType, password' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Validar contraseña del conductor
        const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [driverId]);
        if (!userRes.rows.length) throw new Error('Conductor no encontrado');
        const valid = await bcrypt.compare(password, userRes.rows[0].password);
        if (!valid) {
            await pool.query('ROLLBACK');
            return res.status(401).json({ error: 'Contraseña del conductor incorrecta' });
        }

        // 2. Determinar nuevo estado de la factura
        const statusMap: Record<string, string> = {
            FULL:    'EST-12', // Entregado
            PARTIAL: 'EST-13', // Entrega Parcial
            RETURN:  'EST-01', // Devuelto → vuelve a Pendiente
        };
        const newStatus = statusMap[deliveryType] ?? 'EST-11';

        // 3. Crear confirmación de entrega
        const confirmRes = await pool.query(`
            INSERT INTO delivery_confirmations
                (dispatch_id, invoice_id, driver_id, vehicle_id, delivery_type, delivered_items, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            dispatchId || null, invoiceId, driverId, vehicleId || null,
            deliveryType, JSON.stringify(deliveredItems), notes || null
        ]);

        const confirmationId: number = confirmRes.rows[0].id;

        // 4. Si hay devolución (PARTIAL o RETURN), crear encabezado + detalle
        let returnId: number | null = null;
        const itemsToReturn = deliveredItems.filter((i: any) => Number(i.quantityReturned) > 0);

        if ((deliveryType === 'RETURN' || deliveryType === 'PARTIAL') && itemsToReturn.length > 0) {
            const returnRes = await pool.query(`
                INSERT INTO delivery_returns
                    (confirmation_id, invoice_id, driver_id, vehicle_id, return_reason, notes, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
                RETURNING id
            `, [confirmationId, invoiceId, driverId, vehicleId || null, returnReason || null, notes || null]);

            returnId = returnRes.rows[0].id;

            // Detalle de devolución
            for (const item of itemsToReturn) {
                await pool.query(`
                    INSERT INTO delivery_return_items
                        (return_id, sku, article_name, quantity_returned, quantity_delivered, unit, notes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    returnId, item.sku || null, item.articleName || null,
                    Number(item.quantityReturned), Number(item.quantityDelivered ?? 0),
                    item.unit || null, item.notes || null
                ]);
            }
        }

        // 5. Actualizar estado de los items en document_items
        await pool.query(`
            UPDATE document_items
            SET item_status = $1
            WHERE TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = $2
               OR CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = $2
        `, [newStatus, invoiceId]);

        await pool.query('COMMIT');

        res.json({
            success: true,
            confirmationId,
            returnId,
            newStatus,
            message: deliveryType === 'FULL'
                ? 'Entrega completa registrada'
                : deliveryType === 'PARTIAL'
                ? 'Entrega parcial registrada. Devolución creada.'
                : 'Devolución total registrada. Factura vuelve a estado Pendiente.',
        });
    } catch (error: any) {
        await pool.query('ROLLBACK');
        console.error('[M7-DELIVERY] confirmDelivery error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

// ─── HISTORIAL DE ENTREGAS ────────────────────────────────────────────────────
/**
 * GET /api/dispatch/delivery-history
 * Query params: invoiceId?, driverId?, vehicleId?, dateFrom?, dateTo?, deliveryType?, page?, limit?
 */
export const getDeliveryHistory = async (req: Request, res: Response) => {
    const {
        invoiceId, driverId, vehicleId, dateFrom, dateTo,
        deliveryType, page = '1', limit = '50'
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (invoiceId)     { conditions.push(`dc.invoice_id ILIKE $${idx++}`);    params.push(`%${invoiceId}%`); }
    if (driverId)      { conditions.push(`dc.driver_id = $${idx++}`);          params.push(driverId); }
    if (vehicleId)     { conditions.push(`dc.vehicle_id = $${idx++}`);         params.push(vehicleId); }
    if (deliveryType)  { conditions.push(`dc.delivery_type = $${idx++}`);      params.push(deliveryType); }
    if (dateFrom)      { conditions.push(`dc.delivered_at >= $${idx++}`);      params.push(dateFrom); }
    if (dateTo)        { conditions.push(`dc.delivered_at <= $${idx++}`);      params.push(dateTo); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const [dataRes, countRes] = await Promise.all([
            pool.query(`
                SELECT
                    dc.id           AS "id",
                    dc.invoice_id   AS "invoiceId",
                    dc.dispatch_id  AS "dispatchId",
                    dc.driver_id    AS "driverId",
                    u.name          AS "driverName",
                    dc.vehicle_id   AS "vehicleId",
                    v.plate         AS "vehiclePlate",
                    dc.delivery_type AS "deliveryType",
                    dc.delivered_items AS "deliveredItems",
                    dc.notes,
                    dc.delivered_at AS "deliveredAt",
                    dc.created_at   AS "createdAt",
                    COALESCE(dr.id::text, null) AS "returnId"
                FROM delivery_confirmations dc
                LEFT JOIN users u ON u.id = dc.driver_id
                LEFT JOIN vehicles v ON v.id = dc.vehicle_id
                LEFT JOIN delivery_returns dr ON dr.confirmation_id = dc.id
                ${where}
                ORDER BY dc.delivered_at DESC
                LIMIT $${idx} OFFSET $${idx + 1}
            `, [...params, parseInt(limit), offset]),
            pool.query(`SELECT COUNT(*) FROM delivery_confirmations dc ${where}`, params)
        ]);

        res.json({
            success: true,
            data: dataRes.rows,
            total: parseInt(countRes.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error: any) {
        console.error('[M7-DELIVERY] getDeliveryHistory error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

// ─── HISTORIAL DE DEVOLUCIONES ────────────────────────────────────────────────
/**
 * GET /api/dispatch/return-history
 * Query params: invoiceId?, driverId?, vehicleId?, dateFrom?, dateTo?, status?, page?, limit?
 */
export const getReturnHistory = async (req: Request, res: Response) => {
    const {
        invoiceId, driverId, vehicleId, dateFrom, dateTo,
        status, page = '1', limit = '50'
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (invoiceId)  { conditions.push(`dr.invoice_id ILIKE $${idx++}`);  params.push(`%${invoiceId}%`); }
    if (driverId)   { conditions.push(`dr.driver_id = $${idx++}`);        params.push(driverId); }
    if (vehicleId)  { conditions.push(`dr.vehicle_id = $${idx++}`);       params.push(vehicleId); }
    if (status)     { conditions.push(`dr.status = $${idx++}`);           params.push(status); }
    if (dateFrom)   { conditions.push(`dr.created_at >= $${idx++}`);      params.push(dateFrom); }
    if (dateTo)     { conditions.push(`dr.created_at <= $${idx++}`);      params.push(dateTo); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const [dataRes, countRes] = await Promise.all([
            pool.query(`
                SELECT
                    dr.id               AS "id",
                    dr.invoice_id       AS "invoiceId",
                    dr.driver_id        AS "driverId",
                    u.name              AS "driverName",
                    dr.vehicle_id       AS "vehicleId",
                    v.plate             AS "vehiclePlate",
                    dr.return_reason    AS "returnReason",
                    dr.notes,
                    dr.status,
                    dr.created_at       AS "createdAt",
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id',               dri.id,
                                'sku',              dri.sku,
                                'articleName',      dri.article_name,
                                'quantityReturned', dri.quantity_returned,
                                'quantityDelivered',dri.quantity_delivered,
                                'unit',             dri.unit,
                                'notes',            dri.notes
                            )
                        ) FILTER (WHERE dri.id IS NOT NULL),
                    '[]') AS "items"
                FROM delivery_returns dr
                LEFT JOIN users u ON u.id = dr.driver_id
                LEFT JOIN vehicles v ON v.id = dr.vehicle_id
                LEFT JOIN delivery_return_items dri ON dri.return_id = dr.id
                ${where}
                GROUP BY dr.id, u.name, v.plate
                ORDER BY dr.created_at DESC
                LIMIT $${idx} OFFSET $${idx + 1}
            `, [...params, parseInt(limit), offset]),
            pool.query(`SELECT COUNT(*) FROM delivery_returns dr ${where}`, params)
        ]);

        res.json({
            success: true,
            data: dataRes.rows,
            total: parseInt(countRes.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error: any) {
        console.error('[M7-DELIVERY] getReturnHistory error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

