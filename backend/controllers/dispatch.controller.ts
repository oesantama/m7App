
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logMovement } from '../utils/kardex.js';

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
                INSERT INTO dispatch_signatures_pending (id, dispatch_id, user_id, role_type, signed, signed_at)
                SELECT COALESCE(MAX(id::integer),0)+1, $1, $2, $3, $4, $5
                FROM dispatch_signatures_pending
            `, [dispatchId, sig.userId, sig.role, isSigned, signedAt]);
        }

        // 3. Actualizar estado de los ítems en document_items a 'En ruta' (EST-11)
        const updatedItems = await pool.query(`
            UPDATE document_items
            SET item_status = 'EST-11'
            WHERE CONCAT(document_id, '_', COALESCE(NULLIF(invoice, ''), order_number)) = $1
            OR TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = $1
            RETURNING id, document_id, article_id, expected_qty, batch, invoice, order_number, unit, customer_name, city, address
        `, [invoiceId]);

        // 3b. Poblar vehicle_inventory y route_assignment_items con lo que sale de bodega
        if (updatedItems.rows.length > 0) {
          // Obtener placa del vehículo desde assignments del conductor
          const vehicleRes = await pool.query(
            `SELECT v.plate, d.name as driver_name FROM assignments a
             JOIN vehicles v ON a.vehicle_id::text = v.id::text
             JOIN drivers d ON a.driver_id::text = d.id::text
             WHERE a.driver_id = $1 AND a.is_active = true LIMIT 1`,
            [driverId]
          );
          const vehiclePlate = vehicleRes.rows[0]?.plate || 'S/P';
          const driverName   = vehicleRes.rows[0]?.driver_name || createdBy || 'S/C';

          // Obtener ruta activa para esta factura
          const routeRes = await pool.query(
            `SELECT ri.route_id FROM route_invoices ri WHERE ri.invoice_id = $1 ORDER BY ri.created_at DESC LIMIT 1`,
            [invoiceId]
          );
          const routeId = routeRes.rows[0]?.route_id || null;

          // Obtener client_id del documento
          const clientRes = await pool.query(
            `SELECT client_id FROM documents_l WHERE id = (SELECT document_id FROM document_items WHERE (CONCAT(document_id,'_',COALESCE(NULLIF(invoice,''),order_number))=$1 OR TRIM(COALESCE(NULLIF(invoice,''),order_number))=$1) LIMIT 1)`,
            [invoiceId]
          );
          const clientId = clientRes.rows[0]?.client_id || 'CLI-01';

          // Agrupar por article_id para vehicle_inventory y route_assignment_items
          const artMap: Record<string, { qty: number; batch: string; unit: string; customerName: string; city: string; address: string; docId: string }> = {};
          for (const it of updatedItems.rows) {
            const key = it.article_id;
            if (!artMap[key]) artMap[key] = { qty: 0, batch: it.batch || 'S/L', unit: it.unit || 'und', customerName: it.customer_name || '', city: it.city || '', address: it.address || '', docId: it.document_id };
            artMap[key].qty += Number(it.expected_qty || 0);
          }

          for (const [articleId, d] of Object.entries(artMap)) {
            // Nombre del artículo
            const artRes = await pool.query('SELECT name FROM articles WHERE id = $1 LIMIT 1', [articleId]);
            const articleName = artRes.rows[0]?.name || articleId;

            // vehicle_inventory: suma al stock del vehículo
            await pool.query(`
              INSERT INTO vehicle_inventory (vehicle_plate, driver_id, driver_name, article_id, article_name, batch, client_id, quantity, route_id, last_updated, last_user)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)
              ON CONFLICT (vehicle_plate, article_id, batch) DO UPDATE SET
                quantity    = vehicle_inventory.quantity + EXCLUDED.quantity,
                route_id    = EXCLUDED.route_id,
                driver_id   = EXCLUDED.driver_id,
                driver_name = EXCLUDED.driver_name,
                last_updated = CURRENT_TIMESTAMP,
                last_user   = EXCLUDED.last_user
            `, [vehiclePlate, driverId, driverName, articleId, articleName, d.batch, clientId, d.qty, routeId, createdBy]);

            // route_assignment_items: registro histórico inmutable
            await pool.query(`
              INSERT INTO route_assignment_items
                (route_id, document_id, invoice, article_id, article_name, batch, client_id, vehicle_plate, driver_id, driver_name, assigned_qty, unit, customer_name, city, address, assigned_by, assigned_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CURRENT_TIMESTAMP)
            `, [routeId, d.docId, invoiceId, articleId, articleName, d.batch, clientId, vehiclePlate, driverId, driverName, d.qty, d.unit, d.customerName, d.city, d.address, createdBy]);

            // Kardex: DESPACHO de bodega al vehículo
            logMovement({
              clientId,
              articleId,
              articleName,
              batch:         d.batch,
              movementType:  'DESPACHO',
              quantity:      d.qty,
              locationFrom:  'BODEGA',
              locationTo:    `PLACA-${vehiclePlate}`,
              referenceType: 'DESPACHO',
              referenceId:   String(routeId || invoiceId),
              invoice:       invoiceId,
              vehiclePlate,
              driverId,
              userId:        createdBy,
            });
          }
        }

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
                delivery_type TEXT NOT NULL CHECK (delivery_type IN ('FULL','PARTIAL','RETURN','REPIQUE')),
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

            CREATE TABLE IF NOT EXISTS inventory_news (
                id SERIAL PRIMARY KEY,
                document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
                article_id TEXT,
                quantity NUMERIC DEFAULT 0,
                observation TEXT,
                photo_urls TEXT[], 
                user_name TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Nuevas columnas y tablas para Devoluciones de Bodega (Conciliación)
            ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS bodega_received_at TIMESTAMPTZ;
            ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS bodega_received_by TEXT;
            ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS sobrecosto NUMERIC DEFAULT 0;
            ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS items_returned JSONB DEFAULT '[]';

            CREATE TABLE IF NOT EXISTS bodega_receipts (
                id SERIAL PRIMARY KEY,
                invoice TEXT NOT NULL,
                document_id TEXT NOT NULL,
                client_id TEXT,
                received_by TEXT,
                observation TEXT,
                items JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW()
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
        deliveryType, deliveredItems = [], notes, returnReason, password,
        repiqueDestination
    } = req.body;

    if (!invoiceId || !driverId || !deliveryType) {
        return res.status(400).json({ error: 'Faltan campos requeridos: invoiceId, driverId, deliveryType' });
    }

    try {
        await pool.query('BEGIN');

        // 2. Determinar nuevo estado de la factura
        // EST-15 = REPIQUE (pendiente de re-entrega, distinto de EST-01 pendiente inicial)
        const statusMap: Record<string, string> = {
            FULL:    'EST-12',  // Entregado completo
            PARTIAL: 'EST-13',  // Entrega parcial con devolución
            RETURN:  'EST-01',  // Devolución total → vuelve a pendiente inicial
            REPIQUE: repiqueDestination === 'SAME_PLATE' ? 'EST-11' : 'EST-15', // EST-15 = repique a bodega para re-entrega
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

        // 4. Si hay devolución (PARTIAL, RETURN o REPIQUE), crear encabezado + detalle
        let returnId: number | null = null;
        const itemsToReturn = deliveryType === 'REPIQUE'
            ? deliveredItems.map((i: any) => ({ ...i, quantityReturned: i.quantityDelivered }))
            : deliveredItems.filter((i: any) => Number(i.quantityReturned) > 0);

        if ((deliveryType === 'RETURN' || deliveryType === 'PARTIAL' || deliveryType === 'REPIQUE') && itemsToReturn.length > 0) {
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

        // 6. Ajustar vehicle_inventory según el tipo de entrega
        // Obtener placa del vehículo para identificar el inventario del camión
        const vehiclePlate = vehicleId
          ? (await pool.query('SELECT plate FROM vehicles WHERE id = $1 LIMIT 1', [vehicleId])).rows[0]?.plate || vehicleId
          : vehicleId;

        if (vehiclePlate && deliveredItems.length > 0) {
          for (const item of deliveredItems) {
            const sku = item.sku || item.article_id;
            if (!sku) continue;
            const deliveredQty = Number(item.quantityDelivered ?? 0);
            const returnedQty  = Number(item.quantityReturned  ?? 0);
            const batch = item.batch || 'S/L';

            if (deliveryType === 'FULL') {
              await pool.query(`
                UPDATE vehicle_inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP, last_user = $2
                WHERE vehicle_plate = $3 AND article_id = $4 AND batch = $5
              `, [deliveredQty, driverId, vehiclePlate, sku, batch]);
              logMovement({ articleId: sku, batch, movementType: 'ENTREGA', quantity: deliveredQty,
                locationFrom: `PLACA-${vehiclePlate}`, locationTo: 'CLIENTE',
                referenceType: 'ENTREGA', referenceId: String(confirmationId),
                invoice: invoiceId, vehiclePlate, driverId, userId: driverId });

            } else if (deliveryType === 'PARTIAL') {
              // Descontar lo entregado; lo devuelto queda en vehículo hasta que bodega procese
              await pool.query(`
                UPDATE vehicle_inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP, last_user = $2
                WHERE vehicle_plate = $3 AND article_id = $4 AND batch = $5
              `, [deliveredQty, driverId, vehiclePlate, sku, batch]);
              if (deliveredQty > 0) logMovement({ articleId: sku, batch, movementType: 'ENTREGA_PARCIAL', quantity: deliveredQty,
                locationFrom: `PLACA-${vehiclePlate}`, locationTo: 'CLIENTE',
                referenceType: 'ENTREGA', referenceId: String(confirmationId),
                invoice: invoiceId, vehiclePlate, driverId, userId: driverId });

            } else if (deliveryType === 'RETURN') {
              await pool.query(`
                UPDATE vehicle_inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP, last_user = $2
                WHERE vehicle_plate = $3 AND article_id = $4 AND batch = $5
              `, [returnedQty, driverId, vehiclePlate, sku, batch]);

              const clientRes2 = await pool.query(
                `SELECT d.client_id FROM documents_l d JOIN document_items i ON i.document_id = d.id WHERE (TRIM(COALESCE(NULLIF(i.invoice,''),i.order_number)) = $1) LIMIT 1`,
                [invoiceId]
              );
              const clientId2 = clientRes2.rows[0]?.client_id;
              if (clientId2) {
                await pool.query(`
                  INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
                  VALUES ($1,$2,$3,$4::numeric,$5,CURRENT_TIMESTAMP)
                  ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
                    quantity = GREATEST(0, inventario_clientes.quantity::numeric + $4::numeric), last_user = $5, last_updated = CURRENT_TIMESTAMP
                `, [clientId2, sku, batch, returnedQty, driverId]);
              }
              logMovement({ clientId: clientId2 || undefined, articleId: sku, batch, movementType: 'DEVOLUCION_BODEGA', quantity: returnedQty,
                locationFrom: `PLACA-${vehiclePlate}`, locationTo: 'BODEGA',
                referenceType: 'DEVOLUCION', referenceId: String(returnId || confirmationId),
                invoice: invoiceId, vehiclePlate, driverId, userId: driverId });

            } else if (deliveryType === 'REPIQUE' && repiqueDestination !== 'SAME_PLATE') {
              const totalQty = deliveredQty + returnedQty || Number(item.quantityDelivered ?? item.qty ?? 0);
              await pool.query(`
                UPDATE vehicle_inventory SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP, last_user = $2
                WHERE vehicle_plate = $3 AND article_id = $4 AND batch = $5
              `, [totalQty, driverId, vehiclePlate, sku, batch]);

              const clientRes3 = await pool.query(
                `SELECT d.client_id FROM documents_l d JOIN document_items i ON i.document_id = d.id WHERE (TRIM(COALESCE(NULLIF(i.invoice,''),i.order_number)) = $1) LIMIT 1`,
                [invoiceId]
              );
              const clientId3 = clientRes3.rows[0]?.client_id;
              if (clientId3) {
                await pool.query(`
                  INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
                  VALUES ($1,$2,$3,$4::numeric,$5,CURRENT_TIMESTAMP)
                  ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
                    quantity = GREATEST(0, inventario_clientes.quantity::numeric + $4::numeric), last_user = $5, last_updated = CURRENT_TIMESTAMP
                `, [clientId3, sku, batch, totalQty, driverId]);
              }
              logMovement({ clientId: clientId3 || undefined, articleId: sku, batch, movementType: 'REPIQUE', quantity: totalQty,
                locationFrom: `PLACA-${vehiclePlate}`, locationTo: 'BODEGA',
                referenceType: 'DEVOLUCION', referenceId: String(confirmationId),
                invoice: invoiceId, vehiclePlate, driverId, userId: driverId });
            }
          }
        }

        // ── Actualizar status_id de la ruta si todas sus facturas ya finalizaron ──
        try {
            const routeRes = await pool.query(`
                SELECT ri.route_id FROM route_invoices ri
                JOIN document_items di ON TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                    OR CONCAT(di.document_id, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                WHERE ri.invoice_id = $1
                LIMIT 1
            `, [invoiceId]);

            if (routeRes.rows.length > 0) {
                const routeId = routeRes.rows[0].route_id;
                // Contar facturas de la ruta que NO están en estado final
                const pendingInRoute = await pool.query(`
                    SELECT COUNT(*) FROM route_invoices ri
                    JOIN document_items di ON TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                        OR CONCAT(di.document_id, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                    WHERE ri.route_id = $1
                      AND di.item_status NOT IN ('EST-12','EST-13','EST-14','EST-15','EST-16','EST-17')
                `, [routeId]);

                if (parseInt(pendingInRoute.rows[0].count) === 0) {
                    await pool.query(
                        `UPDATE routes SET status_id = 'EST-12' WHERE id = $1`,
                        [routeId]
                    );
                }
            }
        } catch (_) { /* No crítico — no bloquear la respuesta si falla */ }

        await pool.query('COMMIT');

        res.json({
            success: true,
            confirmationId,
            returnId,
            newStatus,
            message: deliveryType === 'FULL'    ? 'Entrega completa registrada.' :
                     deliveryType === 'PARTIAL' ? 'Entrega parcial registrada. Devolución creada.' :
                     deliveryType === 'REPIQUE' ? (repiqueDestination === 'SAME_PLATE'
                         ? 'Repique registrado. Factura reasignada a la misma placa.'
                         : 'Repique registrado. Mercancía devuelta a bodega.')
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

// ─── SOPORTES DE PAGO ──────────────────────────────────────────────────────

export const uploadVoucher = async (req: Request, res: Response) => {
    try {
        const { invoiceId, dispatchId, fileData, fileName, fileType, fileHash,
                paymentType, amount, bankName, notes, uploadedBy } = req.body;

        if (!invoiceId || !fileData || !fileHash) {
            return res.status(400).json({ error: 'invoiceId, fileData y fileHash son requeridos' });
        }

        // Verificar duplicado por hash (mismo archivo ya subido en el sistema)
        const dup = await pool.query(
            `SELECT id, invoice_id FROM payment_vouchers WHERE file_hash = $1 LIMIT 1`,
            [fileHash]
        );
        if (dup.rows.length > 0) {
            return res.status(409).json({
                error: 'Este soporte ya fue subido anteriormente',
                existingInvoice: dup.rows[0].invoice_id
            });
        }

        const result = await pool.query(
            `INSERT INTO payment_vouchers
               (invoice_id, dispatch_id, file_hash, file_name, file_type, file_data,
                payment_type, amount, bank_name, notes, uploaded_by, verified)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)
             RETURNING id, created_at`,
            [invoiceId, dispatchId || null, fileHash, fileName, fileType, fileData,
             paymentType || 'CONSIGNACION', amount || 0, bankName || '', notes || '', uploadedBy || '']
        );

        res.json({ success: true, voucherId: result.rows[0].id, createdAt: result.rows[0].created_at });
    } catch (error: any) {
        console.error('[M7-VOUCHER] uploadVoucher error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

export const getVouchers = async (req: Request, res: Response) => {
    try {
        const { invoiceId } = req.params;
        const result = await pool.query(
            `SELECT id, invoice_id, dispatch_id, file_name, file_type, payment_type,
                    amount, bank_name, notes, uploaded_by, verified, verified_by, verified_at, created_at
             FROM payment_vouchers
             WHERE invoice_id = $1
             ORDER BY created_at DESC`,
            [invoiceId]
        );
        res.json(result.rows);
    } catch (error: any) {
        console.error('[M7-VOUCHER] getVouchers error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

export const getVoucherFile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT file_data, file_type, file_name FROM payment_vouchers WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Soporte no encontrado' });
        res.json({ fileData: result.rows[0].file_data, fileType: result.rows[0].file_type, fileName: result.rows[0].file_name });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ─── CONTROL DE DEVOLUCIONES (BODEGA) ──────────────────────────────────────

export const getPendingReturns = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [];
        let whereClause = '';
        if (clientId) {
            whereClause = 'AND dl.client_id = $1';
            params.push(clientId);
        }

        const result = await pool.query(`
            SELECT
                dr.id, dr.invoice_id, dr.driver_id, dr.return_reason, dr.notes,
                dr.status, dr.created_at,
                d.name AS driver_name,
                dl.client_id,
                json_agg(json_build_object(
                    'sku',               dri.sku,
                    'article_name',      dri.article_name,
                    'quantity_returned', dri.quantity_returned,
                    'quantity_delivered',dri.quantity_delivered,
                    'unit',              dri.unit,
                    'notes',             dri.notes
                )) AS items
            FROM delivery_returns dr
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id = dr.id
            LEFT JOIN document_items di ON di.invoice = dr.invoice_id
            LEFT JOIN documents_l dl ON dl.id = di.document_id
            WHERE dr.status = 'PENDING' ${whereClause}
            GROUP BY dr.id, d.name, dl.client_id
            ORDER BY dr.created_at DESC
        `, params);
        res.json(result.rows);
    } catch (error: any) {
        console.error('[M7-RETURNS] getPendingReturns error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

export const updateReturnStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, handledBy, notes } = req.body;

        if (!['PROCESSED', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ error: 'Estado inválido. Use PROCESSED o CANCELLED' });
        }

        await pool.query(
            `UPDATE delivery_returns
             SET status = $1,
                 notes  = COALESCE($2, notes),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [status, notes || null, id]
        );

        if (status === 'PROCESSED') {
            // Obtener datos de la devolución y sus items
            const retRes = await pool.query(`
                SELECT dr.invoice_id, dr.vehicle_id, dc.delivery_type,
                       json_agg(json_build_object(
                           'sku', dri.sku, 'qty', dri.quantity_returned, 'batch', 'S/L'
                       )) AS items
                FROM delivery_returns dr
                LEFT JOIN delivery_confirmations dc ON dc.id = dr.confirmation_id
                LEFT JOIN delivery_return_items dri ON dri.return_id = dr.id
                WHERE dr.id = $1
                GROUP BY dr.invoice_id, dr.vehicle_id, dc.delivery_type
            `, [id]);

            if (retRes.rows.length > 0) {
                const row = retRes.rows[0];
                const invoiceId = row.invoice_id;
                const originalType = row.delivery_type;

                // Para PARTIAL: los items devueltos aún están en vehicle_inventory → mover a bodega
                if (originalType === 'PARTIAL') {
                    const vehicleRes = await pool.query('SELECT plate FROM vehicles WHERE id=$1 LIMIT 1', [row.vehicle_id]);
                    const vehiclePlate = vehicleRes.rows[0]?.plate || row.vehicle_id;

                    const clientRes = await pool.query(
                        `SELECT d.client_id FROM documents_l d JOIN document_items i ON i.document_id=d.id
                         WHERE TRIM(COALESCE(NULLIF(i.invoice,''),i.order_number))=$1 LIMIT 1`,
                        [invoiceId]
                    );
                    const clientId = clientRes.rows[0]?.client_id;

                    const items: any[] = Array.isArray(row.items) ? row.items.filter((i: any) => i.sku) : [];
                    for (const item of items) {
                        const qty = Number(item.qty);
                        if (qty <= 0) continue;
                        // Sacar del vehículo
                        await pool.query(`
                            UPDATE vehicle_inventory
                            SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP, last_user = $2
                            WHERE vehicle_plate = $3 AND article_id = $4
                        `, [qty, handledBy || 'BODEGA', vehiclePlate, item.sku]);
                        // Sumar a bodega
                        if (clientId) {
                            await pool.query(`
                                INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
                                VALUES ($1,$2,$3,$4::numeric,$5,CURRENT_TIMESTAMP)
                                ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
                                    quantity = GREATEST(0, inventario_clientes.quantity::numeric + $4::numeric),
                                    last_user = $5, last_updated = CURRENT_TIMESTAMP
                            `, [clientId, item.sku, item.batch || 'S/L', qty, handledBy || 'BODEGA']);
                        }
                        // Kardex: DEVOLUCION_BODEGA
                        logMovement({ clientId: clientId || undefined, articleId: item.sku, batch: item.batch || 'S/L',
                            movementType: 'DEVOLUCION_BODEGA', quantity: qty,
                            locationFrom: `PLACA-${vehiclePlate}`, locationTo: 'BODEGA',
                            referenceType: 'DEVOLUCION', referenceId: String(id),
                            invoice: invoiceId, vehiclePlate, userId: handledBy || 'BODEGA' });
                    }
                }
                // Para FULL RETURN: el inventario ya fue ajustado en confirmDelivery, no repetir

                // Resetear item_status a EST-03 (Para Despacho)
                await pool.query(
                    `UPDATE document_items SET item_status = 'EST-03' WHERE invoice = $1 OR order_number = $1`,
                    [invoiceId]
                );
            }
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('[M7-RETURNS] updateReturnStatus error:', error.message);
        res.status(500).json({ error: error.message });
    }
};

// ─── CONFIRMAR RECEPCIÓN BODEGA (devoluciones post-legalización) ──────────────
// POST /api/dispatch/bodega-receipt
// Cuando conciliación marcó la factura como DEVOLUCION, bodega confirma recepción física
// y el inventario se actualiza en ese momento (no antes).
export const confirmBodegaReturn = async (req: Request, res: Response) => {
    const { invoiceNumber, documentId, receivedBy, observation } = req.body;
    if (!invoiceNumber || !documentId) {
        return res.status(400).json({ error: 'invoiceNumber y documentId son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar que existe conciliación como DEVOLUCION y no ha sido recibida
        const concRes = await client.query(`
            SELECT ic.id FROM invoice_conciliations ic
            WHERE ic.document_id = $1 AND ic.invoice_number = $2
              AND ic.es_devolucion = true
              AND ic.bodega_received_at IS NULL
        `, [documentId, invoiceNumber]);

        if (concRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No se encontró devolución pendiente de recepción para esta factura' });
        }

        // 2. Verificar si el conductor ya procesó esta devolución (vía despacho logístico)
        // Si existe un delivery_return con status=PROCESSED, el inventario ya fue ajustado
        // → solo cerrar la conciliación, NO volver a sumar al inventario
        const dispatchReturnRes = await client.query(`
            SELECT id FROM delivery_returns
            WHERE invoice_id = $1 AND status = 'PROCESSED'
            LIMIT 1
        `, [invoiceNumber]);
        const alreadyProcessedByDispatch = dispatchReturnRes.rows.length > 0;

        // 3. Obtener artículos de la factura
        const itemsRes = await client.query(`
            SELECT di.article_id, a.name as article_name, SUM(di.expected_qty) as qty,
                   di.batch, dl.client_id, dl.vehicle_plate
            FROM document_items di
            JOIN documents_l dl ON dl.id = di.document_id
            LEFT JOIN articles a ON a.id = di.article_id
            WHERE di.document_id = $1 AND di.invoice = $2
            GROUP BY di.article_id, a.name, di.batch, dl.client_id, dl.vehicle_plate
        `, [documentId, invoiceNumber]);

        const receiptItems: any[] = [];

        for (const item of itemsRes.rows) {
            const qty = Number(item.qty);
            if (qty <= 0) continue;

            // 4. Sumar a inventario bodega solo si el despacho NO lo procesó ya
            if (!alreadyProcessedByDispatch) {
                await client.query(`
                    INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
                    VALUES ($1,$2,$3,$4::numeric,$5,CURRENT_TIMESTAMP)
                    ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
                        quantity = GREATEST(0, inventario_clientes.quantity::numeric + $4::numeric),
                        last_user = $5, last_updated = CURRENT_TIMESTAMP
                `, [item.client_id, item.article_id, item.batch || 'S/L', qty, receivedBy]);
            }

            receiptItems.push({ article_id: item.article_id, article_name: item.article_name, batch: item.batch || 'S/L', qty });
        }

        // 4. Registrar en bodega_receipts
        await client.query(`
            INSERT INTO bodega_receipts (invoice, document_id, client_id, received_by, observation, items, created_at)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())
        `, [invoiceNumber, documentId, itemsRes.rows[0]?.client_id || null, receivedBy, observation || null, JSON.stringify(receiptItems)]);

        // 5. Marcar conciliación como recibida
        await client.query(`
            UPDATE invoice_conciliations
            SET bodega_received_at = NOW(), bodega_received_by = $1
            WHERE document_id = $2 AND invoice_number = $3
        `, [receivedBy, documentId, invoiceNumber]);

        // 6. Actualizar item_status a EST-03 (Para Despacho / disponible)
        await client.query(`
            UPDATE document_items SET item_status = 'EST-03'
            WHERE document_id = $1 AND invoice = $2
        `, [documentId, invoiceNumber]);

        await client.query('COMMIT');
        res.json({ success: true, items: receiptItems, inventorySkipped: alreadyProcessedByDispatch });

        // 7. Kardex: DEVOLUCION_BODEGA por cada artículo (fire-and-forget)
        for (const item of receiptItems) {
            logMovement({
                clientId:      itemsRes.rows[0]?.client_id || undefined,
                articleId:     item.article_id,
                articleName:   item.article_name,
                batch:         item.batch,
                movementType:  'DEVOLUCION_BODEGA',
                quantity:      item.qty,
                locationFrom:  'CLIENTE',
                locationTo:    'BODEGA',
                referenceType: 'DEVOLUCION',
                referenceId:   documentId,
                invoice:       invoiceNumber,
                userId:        receivedBy,
                notes:         observation || undefined,
            });
        }
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[M7-BODEGA] confirmBodegaReturn error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

// ─── DEVOLUCIONES PENDIENTES POST-LEGALIZACIÓN ────────────────────────────────
// GET /api/dispatch/pending-bodega-returns
export const getPendingBodegaReturns = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [];
        let whereClause = '';
        if (clientId) {
            whereClause = 'AND dl.client_id = $1';
            params.push(clientId);
        }
        const result = await pool.query(`
            SELECT
                ic.document_id          AS "documentId",
                ic.invoice_number       AS "invoiceNumber",
                ic.vehicle_plate        AS "vehiclePlate",
                ic.conductor_name       AS "conductorName",
                ic.updated_at           AS "legalizadoAt",
                dl.external_doc_id      AS "externalDocId",
                dl.client_id            AS "clientId",
                COALESCE(
                    json_agg(json_build_object(
                        'article_id',   di.article_id,
                        'article_name', a.name,
                        'batch',        di.batch,
                        'qty',          di.expected_qty,
                        'unit',         di.unit
                    )) FILTER (WHERE di.id IS NOT NULL),
                    '[]'
                ) AS items
            FROM invoice_conciliations ic
            JOIN documents_l dl ON dl.id = ic.document_id
            LEFT JOIN document_items di ON di.document_id = ic.document_id AND di.invoice = ic.invoice_number
            LEFT JOIN articles a ON a.id = di.article_id
            WHERE ic.es_devolucion = true
              AND ic.bodega_received_at IS NULL
              ${whereClause}
            GROUP BY ic.document_id, ic.invoice_number, ic.vehicle_plate,
                     ic.conductor_name, ic.updated_at, dl.external_doc_id, dl.client_id
            ORDER BY ic.updated_at DESC
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('[M7-BODEGA] getPendingBodegaReturns error:', error.message);
        // Column may not exist yet (pending migration) — return empty gracefully
        if (error.message?.includes('does not exist')) {
            return res.json({ success: true, data: [] });
        }
        res.status(500).json({ error: error.message });
    }
};

