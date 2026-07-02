
import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '../services/notification.service.js';
import { logMovement } from '../utils/kardex.js';
import { clearInvoicesCache } from './document.controller.js';

// ─── HELPER: resuelve o crea un motivo de devolución, devuelve su ID ───────────
async function resolveReasonId(reasonText: string | null | undefined, dbClient: any): Promise<number | null> {
    if (!reasonText?.trim()) return null;
    const name = reasonText.trim();
    const ex = await dbClient.query(
        `SELECT id FROM return_reasons WHERE TRIM(UPPER(name)) = TRIM(UPPER($1)) LIMIT 1`,
        [name]
    );
    if (ex.rows.length > 0) return ex.rows[0].id;
    const ins = await dbClient.query(
        `INSERT INTO return_reasons (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [name]
    );
    return ins.rows[0].id;
}

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

    // Use a dedicated client so BEGIN/COMMIT wrap all queries in the same connection
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Crear registro de despacho
        const insertRes = await client.query(`
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
                const userRes = await client.query('SELECT password FROM users WHERE id = $1', [sig.userId]);
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

            await client.query(`
                INSERT INTO dispatch_signatures_pending (id, dispatch_id, user_id, role_type, signed, signed_at)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [uuidv4(), dispatchId, sig.userId, sig.role, isSigned, signedAt]);
        }

        // 3. Actualizar estado de los ítems en document_items a 'En ruta' (EST-11)
        const updatedItems = await client.query(`
            UPDATE document_items
            SET item_status = 'EST-11'
            WHERE TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = $1
               OR CONCAT(TRIM(document_id), '_', TRIM(COALESCE(NULLIF(invoice, ''), order_number))) = $1
            RETURNING id, document_id, article_id, expected_qty, batch, invoice, order_number, unit, customer_name, city, address
        `, [invoiceId]);

        console.log(`[DISPATCH] invoiceId=${invoiceId} → updatedItems.rowCount=${updatedItems.rowCount}`);

        if (updatedItems.rowCount === 0) {
            throw new Error(`No se encontraron registros para la factura ${invoiceId} en document_items.`);
        }

        // 3b. Poblar vehicle_inventory y route_assignment_items
        if (updatedItems.rows.length > 0) {
          // Queries de contexto — una sola vez cada una, sin ::text en JOINs
          const [vehicleRes, routeRes, clientRes] = await Promise.all([
            client.query(
              `SELECT v.plate, d.name AS driver_name FROM assignments a
               JOIN vehicles v ON v.id = a.vehicle_id
               JOIN drivers  d ON d.id = a.driver_id
               WHERE a.driver_id = $1 AND a.is_active = true LIMIT 1`,
              [driverId]
            ),
            client.query(
              `SELECT ri.route_id FROM route_invoices ri
               WHERE ri.invoice_id = $1
                  OR ri.invoice_id = CONCAT($2::text, '_', $1::text)
               ORDER BY ri.created_at DESC LIMIT 1`,
              [invoiceId, updatedItems.rows[0]?.document_id || '']
            ),
            client.query(
              `SELECT client_id FROM documents_l WHERE id = $1 LIMIT 1`,
              [updatedItems.rows[0]?.document_id || '']
            ),
          ]);

          const vehiclePlate = vehicleRes.rows[0]?.plate       || 'S/P';
          const driverName   = vehicleRes.rows[0]?.driver_name || createdBy || 'S/C';
          const routeId      = routeRes.rows[0]?.route_id      || null;
          const clientId     = clientRes.rows[0]?.client_id    || 'CLI-01';

          // Agrupar items por artículo
          const artMap: Record<string, { qty: number; batch: string; unit: string; customerName: string; city: string; address: string; docId: string }> = {};
          for (const it of updatedItems.rows) {
            const key = it.article_id;
            if (!artMap[key]) artMap[key] = { qty: 0, batch: it.batch || 'S/L', unit: it.unit || 'und', customerName: it.customer_name || '', city: it.city || '', address: it.address || '', docId: it.document_id };
            artMap[key].qty += Number(it.expected_qty || 0);
          }

          const articleIds = Object.keys(artMap);

          // Un solo SELECT para todos los artículos en lugar de N queries
          const artRows = await client.query(
            'SELECT id, name FROM articles WHERE id = ANY($1)',
            [articleIds]
          );
          const nameMap = new Map<string, string>(artRows.rows.map((r: any) => [String(r.id), String(r.name)]));

          // Batch INSERT para vehicle_inventory — un solo statement con múltiples VALUES
          const viParams: any[] = [];
          const viValues = articleIds.map((articleId, i) => {
            const d = artMap[articleId];
            const n = i * 10;
            viParams.push(vehiclePlate, driverId, driverName, articleId, nameMap.get(articleId) || articleId, d.batch, clientId, d.qty, routeId, createdBy);
            return `($${n+1},$${n+2},$${n+3},$${n+4},$${n+5},$${n+6},$${n+7},$${n+8},$${n+9},CURRENT_TIMESTAMP,$${n+10})`;
          }).join(',');

          await client.query(`
            INSERT INTO vehicle_inventory
              (vehicle_plate,driver_id,driver_name,article_id,article_name,batch,client_id,quantity,route_id,last_updated,last_user)
            VALUES ${viValues}
            ON CONFLICT (vehicle_plate, article_id, batch) DO UPDATE SET
              quantity     = vehicle_inventory.quantity + EXCLUDED.quantity,
              route_id     = EXCLUDED.route_id,
              driver_id    = EXCLUDED.driver_id,
              driver_name  = EXCLUDED.driver_name,
              last_updated = CURRENT_TIMESTAMP,
              last_user    = EXCLUDED.last_user
          `, viParams);

          // Batch INSERT para route_assignment_items
          const raiParams: any[] = [];
          const raiValues = articleIds.map((articleId, i) => {
            const d = artMap[articleId];
            const articleName = nameMap.get(articleId) || articleId;
            const n = i * 16;
            raiParams.push(routeId, d.docId, invoiceId, articleId, articleName, d.batch, clientId, vehiclePlate, driverId, driverName, d.qty, d.unit, d.customerName, d.city, d.address, createdBy);
            return `($${n+1},$${n+2},$${n+3},$${n+4},$${n+5},$${n+6},$${n+7},$${n+8},$${n+9},$${n+10},$${n+11},$${n+12},$${n+13},$${n+14},$${n+15},$${n+16},CURRENT_TIMESTAMP)`;
          }).join(',');

          await client.query(`
            INSERT INTO route_assignment_items
              (route_id,document_id,invoice,article_id,article_name,batch,client_id,vehicle_plate,driver_id,driver_name,assigned_qty,unit,customer_name,city,address,assigned_by,assigned_at)
            VALUES ${raiValues}
          `, raiParams);

          // logMovement es fire-and-forget; se ejecuta fuera de la transacción
          for (const [articleId, d] of Object.entries(artMap)) {
            logMovement({
              clientId,
              articleId,
              articleName:   nameMap.get(articleId) || articleId,
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
        const pendingCount = await client.query(
            'SELECT COUNT(*) FROM dispatch_signatures_pending WHERE dispatch_id = $1 AND signed = false',
            [dispatchId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await client.query(
                "UPDATE dispatch_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [dispatchId]
            );
        }

        await client.query('COMMIT');
        clearInvoicesCache();
        res.json({ success: true, dispatchId, status: parseInt(pendingCount.rows[0].count) === 0 ? 'COMPLETED' : 'PENDING_SIGNATURES' });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Init Dispatch Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

export const signDispatchPending = async (req: Request, res: Response) => {
    const { dispatchId, userId, password } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Validar contraseña
        const userRes = await client.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');

        const valid = await bcrypt.compare(password, userRes.rows[0].password);
        if (!valid) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        // 2. Actualizar firma
        const updateRes = await client.query(`
            UPDATE dispatch_signatures_pending
            SET signed = true, signed_at = CURRENT_TIMESTAMP
            WHERE dispatch_id = $1 AND user_id = $2 AND signed = false
            RETURNING id
        `, [dispatchId, userId]);

        if (updateRes.rows.length === 0) {
           throw new Error('No hay firma pendiente para este usuario en este despacho.');
        }

        // 3. Verificar si ya terminó todo el proceso
        const pendingCount = await client.query(
            'SELECT COUNT(*) FROM dispatch_signatures_pending WHERE dispatch_id = $1 AND signed = false',
            [dispatchId]
        );

        if (parseInt(pendingCount.rows[0].count) === 0) {
            await client.query(
                "UPDATE dispatch_assignments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                [dispatchId]
            );
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

// Returns ALL unsigned signatures for a given invoice (to block ENTREGAR until everyone has signed)
export const getInvoicePendingSignatures = async (req: Request, res: Response) => {
    const { invoiceId } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                dsp.dispatch_id AS "dispatchId",
                dsp.user_id AS "userId",
                dsp.role_type AS "role",
                u.name AS "userName",
                da.invoice_id AS "invoiceId"
            FROM dispatch_signatures_pending dsp
            JOIN dispatch_assignments da ON dsp.dispatch_id::integer = da.id
            JOIN users u ON dsp.user_id::text = u.id::text
            WHERE da.invoice_id = $1 AND dsp.signed = false
            ORDER BY dsp.role_type
        `, [invoiceId]);
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
                delivery_type TEXT NOT NULL CHECK (delivery_type IN ('FULL','PARTIAL','RETURN','REPICE')),
                delivered_items JSONB DEFAULT '[]',
                notes       TEXT,
                delivered_at TIMESTAMPTZ DEFAULT NOW(),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS delivery_returns (
                id          SERIAL PRIMARY KEY,
                invoice_id  TEXT NOT NULL,
                driver_id   TEXT,
                vehicle_id  TEXT,
                notes       TEXT,
                status      TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','CANCELLED')),
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS delivery_return_items (
                id                  SERIAL PRIMARY KEY,
                return_id           TEXT NOT NULL,
                article_id          TEXT,
                un_code             TEXT,
                quantity_returned   TEXT,
                unit                TEXT
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
        repiceDestination
    } = req.body;

    if (!invoiceId || !driverId || !deliveryType) {
        return res.status(400).json({ error: 'Faltan campos requeridos: invoiceId, driverId, deliveryType' });
    }

    try {
        await pool.query('BEGIN');

        // 2. Determinar nuevo estado de la factura
        // EST-15 = REPICE (pendiente de re-entrega, distinto de EST-01 pendiente inicial)
        const statusMap: Record<string, string> = {
            FULL:    'EST-12',  // Entregado completo
            PARTIAL: 'EST-14',  // Entrega parcial
            RETURN:  'EST-13',  // Devolución total
            REPICE: repiceDestination === 'SAME_PLATE' ? 'EST-11' : 'EST-15', // EST-15 = repice a bodega para re-entrega
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

        // 4. Devolución: encabezado + batch INSERT de items
        let returnId: number | null = null;
        const itemsToReturn = deliveryType === 'REPICE'
            ? deliveredItems.map((i: any) => ({ ...i, quantityReturned: i.quantityDelivered }))
            : deliveredItems.filter((i: any) => Number(i.quantityReturned) > 0);

        if ((deliveryType === 'RETURN' || deliveryType === 'PARTIAL' || deliveryType === 'REPICE') && itemsToReturn.length > 0) {
            const rsnId = await resolveReasonId(returnReason, pool);
            const returnRes = await pool.query(`
                INSERT INTO delivery_returns
                    (invoice_id, driver_id, vehicle_id, reason_id, notes, status)
                VALUES ($1, $2, $3, $4, $5, 'PENDING')
                RETURNING id
            `, [invoiceId, driverId, vehicleId || null, rsnId, notes || null]);

            returnId = returnRes.rows[0].id;

            // Batch INSERT: todos los items en un solo statement
            const riParams: any[] = [];
            const riValues = itemsToReturn.map((item: any, i: number) => {
                const n = i * 4;
                riParams.push(returnId, item.sku || item.article_id || null,
                    Number(item.quantityReturned), item.unit || null);
                return `($${n+1},$${n+2},$${n+3},$${n+4})`;
            }).join(',');

            await pool.query(`
                INSERT INTO delivery_return_items
                    (return_id, article_id, quantity_returned, unit)
                VALUES ${riValues}
            `, riParams);
        }

        // 5. Actualizar estado de los items en document_items
        await pool.query(`
            UPDATE document_items
            SET item_status = $1
            WHERE TRIM(COALESCE(NULLIF(invoice, ''), order_number)) = TRIM($2)
               OR CONCAT(TRIM(document_id), '_', TRIM(COALESCE(NULLIF(invoice, ''), order_number))) = TRIM($2)
        `, [newStatus, invoiceId]);

        // 6. Ajustar vehicle_inventory — un SELECT para placa, luego batch UPDATE
        const vehiclePlate = vehicleId
          ? (await pool.query('SELECT plate FROM vehicles WHERE id = $1 LIMIT 1', [vehicleId])).rows[0]?.plate || vehicleId
          : vehicleId;

        if (vehiclePlate && deliveredItems.length > 0) {
            // Resolver client_id una sola vez (es el mismo para todos los items de la misma factura)
            let invoiceClientId: string | undefined;
            if (deliveryType === 'RETURN' || (deliveryType === 'REPICE' && repiceDestination !== 'SAME_PLATE')) {
                const clientRes = await pool.query(
                    `SELECT d.client_id FROM documents_l d
                     JOIN document_items i ON i.document_id = d.id
                     WHERE TRIM(COALESCE(NULLIF(i.invoice,''), i.order_number)) = $1 LIMIT 1`,
                    [invoiceId]
                );
                invoiceClientId = clientRes.rows[0]?.client_id;
            }

            // Construir lista de (sku, batch, qtyToSubtract) según tipo de entrega
            type InvRow = { sku: string; batch: string; qty: number; movType: string };
            const invRows: InvRow[] = [];
            const icRows: { sku: string; batch: string; qty: number }[] = [];

            for (const item of deliveredItems) {
                const sku = item.sku || item.article_id;
                if (!sku) continue;
                const deliveredQty = Number(item.quantityDelivered ?? 0);
                const returnedQty  = Number(item.quantityReturned  ?? 0);
                const batch        = item.batch || 'S/L';

                if (deliveryType === 'FULL') {
                    invRows.push({ sku, batch, qty: deliveredQty, movType: 'ENTREGA' });
                } else if (deliveryType === 'PARTIAL') {
                    if (deliveredQty > 0) invRows.push({ sku, batch, qty: deliveredQty, movType: 'ENTREGA_PARCIAL' });
                } else if (deliveryType === 'RETURN') {
                    invRows.push({ sku, batch, qty: returnedQty, movType: 'DEVOLUCION_BODEGA' });
                    if (invoiceClientId) icRows.push({ sku, batch, qty: returnedQty });
                } else if (deliveryType === 'REPICE' && repiceDestination !== 'SAME_PLATE') {
                    const totalQty = deliveredQty + returnedQty || Number(item.quantityDelivered ?? item.qty ?? 0);
                    invRows.push({ sku, batch, qty: totalQty, movType: 'REPICE' });
                    if (invoiceClientId) icRows.push({ sku, batch, qty: totalQty });
                }
            }

            // Batch UPDATE vehicle_inventory con VALUES join (1 query para todos los items)
            if (invRows.length > 0) {
                const viParams: any[] = [driverId, vehiclePlate];
                const viValues = invRows.map((r, i) => {
                    const n = i * 3 + 3;
                    viParams.push(r.sku, r.batch, r.qty);
                    return `($${n}::text, $${n+1}::text, $${n+2}::numeric)`;
                }).join(',');

                await pool.query(`
                    UPDATE vehicle_inventory vi
                    SET quantity = GREATEST(0, vi.quantity - v.qty),
                        last_updated = CURRENT_TIMESTAMP, last_user = $1
                    FROM (VALUES ${viValues}) AS v(article_id, batch, qty)
                    WHERE vi.vehicle_plate = $2
                      AND vi.article_id   = v.article_id
                      AND vi.batch        = v.batch
                `, viParams);
            }

            // Batch UPSERT inventario_clientes (RETURN / REPICE)
            if (icRows.length > 0 && invoiceClientId) {
                const icParams: any[] = [driverId, invoiceClientId];
                const icValues = icRows.map((r, i) => {
                    const n = i * 3 + 3;
                    icParams.push(r.sku, r.batch, r.qty);
                    return `($${n}::text, $${n+1}::text, $${n+2}::numeric)`;
                }).join(',');

                await pool.query(`
                    INSERT INTO inventario_clientes (client_id, article_id, batch, quantity, last_user, last_updated)
                    SELECT $2, v.sku, v.batch, v.qty, $1, CURRENT_TIMESTAMP
                    FROM (VALUES ${icValues}) AS v(sku, batch, qty)
                    ON CONFLICT (client_id, article_id, batch) DO UPDATE SET
                        quantity = GREATEST(0, inventario_clientes.quantity::numeric + EXCLUDED.quantity::numeric),
                        last_user = $1, last_updated = CURRENT_TIMESTAMP
                `, icParams);
            }

            // logMovement es fire-and-forget — fuera de la transacción
            const movType = deliveryType === 'FULL' ? 'ENTREGA'
                : deliveryType === 'PARTIAL' ? 'ENTREGA_PARCIAL'
                : deliveryType === 'REPICE'  ? 'REPICE'
                : 'DEVOLUCION_BODEGA';
            const locationTo = (deliveryType === 'FULL' || deliveryType === 'PARTIAL') ? 'CLIENTE' : 'BODEGA';
            for (const r of invRows) {
                logMovement({ clientId: invoiceClientId, articleId: r.sku, batch: r.batch,
                    movementType: movType, quantity: r.qty,
                    locationFrom: `PLACA-${vehiclePlate}`, locationTo,
                    referenceType: deliveryType === 'FULL' || deliveryType === 'PARTIAL' ? 'ENTREGA' : 'DEVOLUCION',
                    referenceId: String(returnId || confirmationId),
                    invoice: invoiceId, vehiclePlate, driverId, userId: driverId });
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
                // LEFT JOIN para no excluir route_invoices sin match en document_items
                // (match fallido haría count=0 y auto-completaría la ruta incorrectamente)
                const pendingInRoute = await pool.query(`
                    SELECT COUNT(*) FROM route_invoices ri
                    LEFT JOIN document_items di ON (
                        TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                        OR CONCAT(di.document_id::text, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
                    )
                    WHERE ri.route_id = $1
                      AND (di.item_status IS NULL
                           OR di.item_status NOT IN ('EST-12','EST-13','EST-14','EST-15','EST-16','EST-17'))
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
        clearInvoicesCache();

        res.json({
            success: true,
            confirmationId,
            returnId,
            newStatus,
            message: deliveryType === 'FULL'    ? 'Entrega completa registrada.' :
                     deliveryType === 'PARTIAL' ? 'Entrega parcial registrada. Devolución creada.' :
                     deliveryType === 'REPICE' ? (repiceDestination === 'SAME_PLATE'
                         ? 'Repice registrado. Factura reasignada a la misma placa.'
                         : 'Repice registrado. Mercancía devuelta a bodega.')
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
                    null::text AS "returnId"
                FROM delivery_confirmations dc
                LEFT JOIN users u ON u.id = dc.driver_id
                LEFT JOIN vehicles v ON v.id = dc.vehicle_id
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
                    rr.name             AS "returnReason",
                    dr.notes,
                    dr.status,
                    dr.created_at       AS "createdAt",
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id',               dri.id,
                                'articleId',        dri.article_id,
                                'articleName',      art.name,
                                'quantityReturned', dri.quantity_returned,
                                'unit',             dri.unit
                            )
                        ) FILTER (WHERE dri.id IS NOT NULL),
                    '[]') AS "items"
                FROM delivery_returns dr
                LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
                LEFT JOIN users u ON u.id = dr.driver_id
                LEFT JOIN vehicles v ON v.id = dr.vehicle_id
                LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
                LEFT JOIN articles art ON art.id::text = dri.article_id
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
                dr.id, dr.invoice_id, dr.driver_id, rr.name AS return_reason, dr.notes,
                dr.status, dr.created_at,
                d.name AS driver_name,
                dl.client_id,
                COALESCE(json_agg(json_build_object(
                    'article_id',        dri.article_id,
                    'article_name',      art.name,
                    'quantity_returned', dri.quantity_returned,
                    'unit',              dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM delivery_returns dr
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            LEFT JOIN document_items di ON di.invoice = dr.invoice_id
            LEFT JOIN documents_l dl ON dl.id = di.document_id
            WHERE dr.status = 'PENDING' ${whereClause}
            GROUP BY dr.id, rr.name, d.name, dl.client_id
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
                SELECT dr.invoice_id, dr.vehicle_id,
                       COALESCE(json_agg(json_build_object(
                           'sku', dri.article_id, 'qty', dri.quantity_returned, 'batch', 'S/L'
                       )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
                FROM delivery_returns dr
                LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
                WHERE dr.id = $1
                GROUP BY dr.invoice_id, dr.vehicle_id
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

// ─── GET /api/dispatch/invoice-return-data/:invoiceNumber ────────────────────
// Busca una factura por número para pre-cargar datos al registrar devolución bodega.
// No requiere placa ni estado EST-11 — funciona con cualquier factura del sistema.
export const getInvoiceReturnData = async (req: Request, res: Response) => {
    try {
        const invoiceNumber = String(req.params.invoiceNumber || '');
        if (!invoiceNumber) return res.status(400).json({ error: 'invoiceNumber requerido' });

        const inv = invoiceNumber.trim().toUpperCase();

        // Buscar items de la factura con datos de planilla, artículo y factores de conversión
        const result = await pool.query(`
            SELECT
                di.invoice           AS invoice_id,
                di.order_number,
                di.customer_name,
                di.client_ref,
                di.address,
                di.city,
                di.un_code,
                di.unit,
                di.expected_qty,
                di.item_status,
                di.article_id,
                COALESCE(a.name, di.article_id) AS article_name,
                COALESCE(a.barcode, di.article_id) AS barcode,
                COALESCE(a.sku, di.article_id)     AS sku,
                COALESCE(a.factor_inter, 0)::numeric AS factor_inter,
                COALESCE(a.factor_std, 1)::numeric   AS factor_std,
                COALESCE(a.uom_std, di.unit, 'UND')  AS uom_std,
                COALESCE(ui.name, 'CAJA')            AS uom_inter_name,
                COALESCE(us.name, 'STD')             AS uom_std_name,
                dl.vehicle_plate,
                dl.external_doc_id   AS numero_planilla,
                dl.delivery_date     AS fecha_placa,
                dl.plan_type,
                dl.client_id
            FROM document_items di
            JOIN documents_l dl ON dl.id = di.document_id
            LEFT JOIN articles a ON TRIM(UPPER(a.id)) = TRIM(UPPER(di.article_id))
            LEFT JOIN unidades_medida ui ON ui.id = a.uom_inter_id
            LEFT JOIN unidades_medida us ON us.id = a.uom_std
            WHERE TRIM(UPPER(di.invoice)) = $1
               OR TRIM(UPPER(di.order_number)) = $1
            ORDER BY di.article_id
        `, [inv]);

        if (!result.rowCount) {
            return res.status(404).json({ error: `Factura "${invoiceNumber}" no encontrada en el sistema` });
        }

        // Conductor, placa e IDs desde route_invoices → routes (histórico)
        const routeAssignResult = await pool.query(`
            SELECT
                d.id::text   AS driver_id,
                d.name       AS conductor_name,
                v.id::text   AS vehicle_id,
                v.plate      AS assigned_plate,
                r.created_at AS assigned_at
            FROM route_invoices ri
            JOIN routes r ON r.id::text = ri.route_id::text
            LEFT JOIN drivers d ON d.id::text = r.driver_id::text
            LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
            WHERE ri.invoice_id = $1
            ORDER BY r.created_at DESC
            LIMIT 1
        `, [inv]);

        // Fallback: buscar por placa en documents_l si no hay ruta asignada
        const firstRow = result.rows[0];
        let conductorName: string | null = null;
        let assignedPlate: string | null = null;
        let assignedAt: string | null = null;
        let resolvedVehicleId: string | null = null;
        let resolvedDriverId: string | null = null;

        if (routeAssignResult.rowCount) {
            const ra = routeAssignResult.rows[0];
            conductorName     = ra.conductor_name;
            assignedPlate     = ra.assigned_plate;
            assignedAt        = ra.assigned_at;
            resolvedVehicleId = ra.vehicle_id;
            resolvedDriverId  = ra.driver_id;
        } else if (firstRow?.vehicle_plate) {
            // Última asignación conocida para esa placa (cualquier estado)
            const fallbackRes = await pool.query(`
                SELECT v.id::text AS vehicle_id, a.driver_id::text
                FROM vehicles v
                LEFT JOIN assignments a ON a.vehicle_id::text = v.id::text
                WHERE TRIM(UPPER(v.plate)) = TRIM(UPPER($1))
                ORDER BY a.id DESC NULLS LAST
                LIMIT 1
            `, [firstRow.vehicle_plate]);
            if (fallbackRes.rowCount) {
                resolvedVehicleId = fallbackRes.rows[0].vehicle_id;
                resolvedDriverId  = fallbackRes.rows[0].driver_id;
            }
            assignedPlate = firstRow.vehicle_plate;
        }

        // Devoluciones previas para esta factura (suma de qty devuelta por artículo)
        const prevReturnsResult = await pool.query(`
            SELECT
                dr.id              AS return_id,
                rr.name            AS return_reason,
                dr.status          AS return_status,
                dr.created_at,
                dr.vendedor,
                dri.article_id,
                SUM(dri.quantity_returned::numeric) AS qty_returned
            FROM delivery_returns dr
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            JOIN delivery_return_items dri ON dr.id::text = dri.return_id::text
            WHERE TRIM(UPPER(dr.invoice_id)) = $1
            GROUP BY dr.id, rr.name, dr.status, dr.created_at, dr.vendedor, dri.article_id
            ORDER BY dr.created_at DESC
        `, [inv]);

        // Mapa article_id → total ya devuelto
        const returnedByArticle: Record<string, number> = {};
        for (const row of prevReturnsResult.rows) {
            const aid = String(row.article_id || '').trim().toUpperCase();
            returnedByArticle[aid] = (returnedByArticle[aid] || 0) + Number(row.qty_returned);
        }

        // Devoluciones previas agrupadas por return_id (para mostrar historial)
        const prevReturnsMap: Record<string, any> = {};
        for (const row of prevReturnsResult.rows) {
            if (!prevReturnsMap[row.return_id]) {
                prevReturnsMap[row.return_id] = {
                    return_id:     row.return_id,
                    return_reason: row.return_reason,
                    status:        row.return_status,
                    created_at:    row.created_at,
                    vendedor:      row.vendedor,
                    items:         [],
                };
            }
            prevReturnsMap[row.return_id].items.push({
                article_id:   row.article_id,
                qty_returned: Number(row.qty_returned),
            });
        }
        const previousReturns = Object.values(prevReturnsMap);

        // Estado global de la factura respecto a devoluciones
        const allItems = result.rows;
        const totalExpected = allItems.reduce((s, r) => s + Number(r.expected_qty), 0);
        const totalReturned = allItems.reduce((s, r) => {
            const aid = String(r.article_id || '').trim().toUpperCase();
            return s + (returnedByArticle[aid] || 0);
        }, 0);

        let returnStatus: 'none' | 'partial' | 'complete' = 'none';
        if (totalReturned > 0) {
            returnStatus = totalReturned >= totalExpected ? 'complete' : 'partial';
        }

        // Detectar si fue procesada por conciliación sin pasar por bodega (EST-13)
        const fromConciliacion = result.rows.some(r =>
            ['EST-13','DEVUELTO','DEVUELT'].includes((r.item_status || '').toUpperCase())
        );

        const first = result.rows[0];
        res.json({
            success: true,
            fromConciliacion,
            invoice: {
                invoice_id:      first.invoice_id,
                order_number:    first.order_number,
                customer_name:   first.customer_name,
                client_ref:      first.client_ref,
                address:         first.address,
                city:            first.city,
                vehicle_plate:   first.vehicle_plate,
                numero_planilla: first.numero_planilla,
                fecha_placa:     first.fecha_placa,
                plan_type:       first.plan_type,
                client_id:       first.client_id,
                conductor_name:  conductorName,
                assigned_plate:  assignedPlate,
                assigned_at:     assignedAt,
                vehicle_id:      resolvedVehicleId,
                driver_id:       resolvedDriverId,
            },
            returnStatus,
            previousReturns,
            items: result.rows.map(r => {
                const aid = String(r.article_id || '').trim().toUpperCase();
                const qty_returned = returnedByArticle[aid] || 0;
                const remaining = Math.max(0, Number(r.expected_qty) - qty_returned);
                return {
                    article_id:    r.article_id,
                    article_name:  r.article_name,
                    barcode:       r.barcode,
                    sku:           r.sku,
                    un_code:       r.un_code,
                    unit:          r.unit,
                    expected_qty:  Number(r.expected_qty),
                    qty_returned,
                    remaining_qty: remaining,
                    factor_inter:  Number(r.factor_inter),
                    factor_std:    Number(r.factor_std),
                    uom_std:       r.uom_std,
                    uom_inter_name: r.uom_inter_name,
                    uom_std_name:  r.uom_std_name,
                };
            }),
        });
    } catch (err: any) {
        console.error('[M7-DEVOL] getInvoiceReturnData:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/dispatch/route-active-plates ────────────────────────────────────
// Placas con vehículos actualmente en ruta y con facturas sin entregar (EST-11)
export const getRouteActivePlates = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = ['EST-11'];
        let clientFilter = '';
        if (clientId) { params.push(clientId); clientFilter = `AND dl.client_id = $${params.length}`; }

        const result = await pool.query(`
            SELECT DISTINCT
                v.plate,
                v.id AS vehicle_id,
                d.name AS driver_name,
                d.id AS driver_id,
                COUNT(DISTINCT di.invoice) AS invoice_count
            FROM document_items di
            JOIN documents_l dl ON dl.id = di.document_id
            JOIN route_assignment_items rai ON rai.invoice = di.invoice AND rai.item_status = $1
            JOIN vehicles v ON v.plate = rai.vehicle_plate
            LEFT JOIN assignments a ON a.vehicle_id::text = v.id::text AND a.is_active = true
            LEFT JOIN drivers d ON d.id::text = a.driver_id::text
            WHERE di.item_status = $1 ${clientFilter}
            GROUP BY v.plate, v.id, d.name, d.id
            ORDER BY v.plate
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-RETURNS] getRouteActivePlates:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /api/dispatch/route-plate-invoices/:plate ────────────────────────────
// Facturas de una placa que están en ruta sin entregar
export const getRoutePlateInvoices = async (req: Request, res: Response) => {
    try {
        const { plate } = req.params;
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [plate, 'EST-11'];
        let clientFilter = '';
        if (clientId) { params.push(clientId); clientFilter = `AND dl.client_id = $${params.length}`; }

        const result = await pool.query(`
            SELECT DISTINCT
                di.invoice AS invoice_id,
                di.customer_name,
                di.address,
                di.city,
                dl.client_id,
                COUNT(di.id) AS item_count,
                SUM(di.expected_qty) AS total_qty,
                json_agg(json_build_object(
                    'article_id', di.article_id,
                    'article_name', COALESCE(a.name, di.article_id),
                    'batch', di.batch,
                    'expected_qty', di.expected_qty,
                    'unit', di.unit
                )) AS items
            FROM document_items di
            JOIN documents_l dl ON dl.id = di.document_id
            JOIN route_assignment_items rai ON rai.invoice = di.invoice AND rai.vehicle_plate = $1 AND rai.item_status = $2
            LEFT JOIN articles a ON a.id = di.article_id
            WHERE di.item_status = $2 ${clientFilter}
            GROUP BY di.invoice, di.customer_name, di.address, di.city, dl.client_id
            ORDER BY di.invoice
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-RETURNS] getRoutePlateInvoices:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /api/dispatch/register-route-return ─────────────────────────────────
// Registra devolución iniciada desde bodega. vehiclePlate es opcional (se toma del plan si existe).
export const registerRouteReturn = async (req: Request, res: Response) => {
    const {
        invoiceId, vehiclePlate, vehicleId: bodyVehicleId, driverId: bodyDriverId,
        returnType, returnReason, notes, items, createdBy,
        vendedor, numeroPlanilla, fechaPlaca,
    } = req.body;
    if (!invoiceId || !returnType) {
        return res.status(400).json({ success: false, error: 'invoiceId y returnType son requeridos' });
    }
    if (!vendedor || !String(vendedor).trim()) {
        return res.status(400).json({ success: false, error: 'El código del vendedor es obligatorio' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Usar IDs que vienen del frontend (ya resueltos desde route_invoices)
        // Solo hacer lookup por placa si no vienen los IDs directamente
        let vehicleId: string | null = bodyVehicleId || null;
        let driverId:  string | null = bodyDriverId  || null;
        const plateToUse = vehiclePlate || null;
        if ((!vehicleId || !driverId) && plateToUse) {
            const vRes = await client.query(
                `SELECT v.id::text AS vehicle_id, a.driver_id::text
                 FROM vehicles v
                 LEFT JOIN assignments a ON a.vehicle_id::text = v.id::text
                 WHERE TRIM(UPPER(v.plate)) = TRIM(UPPER($1))
                 ORDER BY a.id DESC NULLS LAST LIMIT 1`,
                [plateToUse]
            );
            if (vRes.rowCount) {
                vehicleId = vehicleId || vRes.rows[0].vehicle_id || null;
                driverId  = driverId  || vRes.rows[0].driver_id  || null;
            }
        }

        // Cabecera delivery_return
        const rsnId = await resolveReasonId(returnReason, client);
        const retRes = await client.query(
            `INSERT INTO delivery_returns
                (invoice_id, vehicle_id, driver_id, reason_id, notes, status,
                 vendedor, numero_planilla, fecha_placa, created_at)
             VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,CURRENT_TIMESTAMP)
             RETURNING id`,
            [invoiceId, vehicleId, driverId, rsnId, notes || null,
             String(vendedor).trim(), numeroPlanilla || null, fechaPlaca || null]
        );
        const returnId = retRes.rows[0].id;

        // Ítems con article_id y un_code
        const itemsArr = Array.isArray(items) ? items : [];
        for (const item of itemsArr) {
            const qty = Number(item.return_qty ?? item.quantity_returned ?? 0);
            if (qty <= 0) continue;
            await client.query(
                `INSERT INTO delivery_return_items
                    (return_id, article_id, un_code, quantity_returned, unit)
                 VALUES ($1,$2,$3,$4,$5)`,
                [
                    returnId,
                    item.article_id || item.sku || null,
                    item.un_code    || null,
                    qty,
                    item.unit || 'UND',
                ]
            );
        }

        // Marcar item_status en document_items
        if (returnType === 'COMPLETA') {
            // Devolución completa: toda la factura se devolvió
            await client.query(
                `UPDATE document_items SET item_status = 'EST-16'
                 WHERE TRIM(UPPER(COALESCE(NULLIF(invoice,''), order_number))) = $1`,
                [invoiceId.trim().toUpperCase()]
            );
        } else {
            // Devolución parcial: marcar SOLO los artículos que realmente se devolvieron
            const returnedArticleIds = itemsArr
                .map((item: any) => String(item.article_id || item.sku || '').trim().toUpperCase())
                .filter(Boolean);
            if (returnedArticleIds.length > 0) {
                await client.query(
                    `UPDATE document_items SET item_status = 'EST-17'
                     WHERE TRIM(UPPER(COALESCE(NULLIF(invoice,''), order_number))) = $1
                       AND TRIM(UPPER(article_id)) = ANY($2::text[])`,
                    [invoiceId.trim().toUpperCase(), returnedArticleIds]
                );
            }
        }

        // Log
        await client.query(
            `INSERT INTO route_modifications_log (invoice_id, action, user_id, previous_plate, details)
             VALUES ($1,'BODEGA_RETURN',$2,$3,$4)`,
            [invoiceId, createdBy || null, plateToUse || 'BODEGA',
             JSON.stringify({ returnType, returnReason, vendedor, notes, timestamp: new Date().toISOString() })]
        );

        await client.query('COMMIT');
        res.json({ success: true, returnId });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-RETURNS] registerRouteReturn:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// ─── GET /api/dispatch/approval-pending ──────────────────────────────────────
// Devoluciones procesadas por bodega que aún no pertenecen a ningún lote de aprobación
export const getApprovalPendingReturns = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = ['PENDING', 'PROCESSED', 'CONFIRMED'];
        let clientFilter = '';
        if (clientId) { params.push(clientId); clientFilter = `AND dl.client_id = $${params.length}`; }

        const result = await pool.query(`
            SELECT
                dr.id, dr.invoice_id, rr.name AS return_reason, dr.notes, dr.status, dr.created_at,
                dr.conciliacion_confirmada_at, dr.conciliacion_confirmada_by,
                v.plate AS vehicle_plate,
                d.name  AS driver_name,
                dl.client_id,
                dl.external_doc_id,
                COALESCE(json_agg(json_build_object(
                    'article_id',        dri.article_id,
                    'article_name',      art.name,
                    'quantity_returned', dri.quantity_returned,
                    'unit',              dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM delivery_returns dr
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            LEFT JOIN document_items di ON di.invoice = dr.invoice_id
            LEFT JOIN documents_l dl ON dl.id = di.document_id
            WHERE dr.status IN ($1, $2, $3)
              AND dr.id NOT IN (SELECT return_id::int FROM return_approval_batch_items WHERE return_id IS NOT NULL)
              ${clientFilter}
            GROUP BY dr.id, rr.name, v.plate, d.name, dl.client_id, dl.external_doc_id
            ORDER BY dr.status DESC, dr.created_at DESC
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-RETURNS] getApprovalPendingReturns:', err.message);
        if (err.message?.includes('does not exist')) return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /api/dispatch/approval-batches ─────────────────────────────────────
// Crea un lote de aprobación agrupando devoluciones seleccionadas
export const createApprovalBatch = async (req: Request, res: Response) => {
    const { clientId, returnIds, notes, createdBy } = req.body;
    if (!clientId || !Array.isArray(returnIds) || returnIds.length === 0) {
        return res.status(400).json({ success: false, error: 'clientId y returnIds son requeridos' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Generar código único: DEV-YYYY-MM-DD-NNN
        const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const countRes = await client.query(
            `SELECT COUNT(*) FROM return_approval_batches WHERE batch_code LIKE $1`,
            [`DEV-${dateStr}-%`]
        );
        const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0');
        const batchCode = `DEV-${dateStr}-${seq}`;

        const batchRes = await client.query(
            `INSERT INTO return_approval_batches (batch_code, client_id, notes, status, created_by, created_at, sent_at)
             VALUES ($1, $2, $3, 'borrador', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id, batch_code`,
            [batchCode, clientId, notes || null, createdBy || null]
        );
        const batchId   = batchRes.rows[0].id;
        const batchCodeOut = batchRes.rows[0].batch_code;

        for (const returnId of returnIds) {
            // Obtener datos del return para desnormalizar
            const retInfo = await client.query(
                `SELECT dr.invoice_id, rr.name AS return_reason
                 FROM delivery_returns dr
                 LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
                 WHERE dr.id = $1`, [returnId]
            );
            const invoiceId   = retInfo.rows[0]?.invoice_id  || null;
            const returnReason= retInfo.rows[0]?.return_reason|| null;

            await client.query(
                `INSERT INTO return_approval_batch_items (batch_id, return_id, invoice_id, return_reason, approved)
                 VALUES ($1, $2, $3, $4, false)`,
                [batchId, returnId, invoiceId, returnReason]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, batchId, batchCode: batchCodeOut });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-BATCH] createApprovalBatch:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// ─── GET /api/dispatch/delivery-returns/tracking ─────────────────────────────
// Pipeline de seguimiento: todas las devoluciones activas de un cliente
export const getReturnsTracking = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [];
        let clientFilter = '';
        if (clientId) { params.push(clientId); clientFilter = `AND doc_info.client_id = $${params.length}`; }

        const result = await pool.query(`
            SELECT
                dr.id,
                dr.invoice_id,
                dr.return_type,
                rr.name                      AS return_reason,
                dr.notes,
                dr.status,
                dr.created_at::date          AS fecha,
                dr.vendedor,
                dr.numero_planilla,
                dr.conciliacion_confirmada_at, dr.conciliacion_confirmada_by,
                dr.pre_approval_at,   dr.pre_approval_by,
                dr.pre_approved_at,   dr.pre_approved_by,
                dr.supplier_exit_at,  dr.supplier_exit_by,
                dr.completed_at,      dr.completed_by,
                dr.excel_downloaded_at,
                v.plate                      AS vehicle_plate,
                d.name                       AS driver_name,
                doc_info.customer_name,
                doc_info.client_ref          AS codigo_cliente,
                doc_info.order_number,
                doc_info.delivery_date::date AS fecha_placa,
                doc_info.client_id,
                doc_info.plan_type,
                COALESCE(json_agg(json_build_object(
                    'article_id',        dri.article_id,
                    'article_name',      art.name,
                    'quantity_returned', dri.quantity_returned,
                    'un_code',           COALESCE(dlp.un_code, di_item.un_code, dri.un_code),
                    'unit',              COALESCE(di_item.unit, dri.unit)
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM delivery_returns dr
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            LEFT JOIN document_items di_item
                   ON TRIM(UPPER(COALESCE(di_item.invoice, di_item.order_number))) = TRIM(UPPER(dr.invoice_id))
                  AND TRIM(UPPER(di_item.article_id)) = TRIM(UPPER(dri.article_id))
            LEFT JOIN document_l_payments dlp
                   ON TRIM(UPPER(dlp.invoice)) = TRIM(UPPER(dr.invoice_id))
            LEFT JOIN LATERAL (
                SELECT di.customer_name, di.client_ref, di.order_number,
                       dl.delivery_date, dl.client_id, dl.plan_type
                FROM document_items di
                LEFT JOIN documents_l dl ON dl.id = di.document_id
                WHERE TRIM(UPPER(COALESCE(di.invoice, di.order_number))) = TRIM(UPPER(dr.invoice_id))
                LIMIT 1
            ) doc_info ON true
            WHERE dr.status NOT IN ('CANCELLED','COMPLETED')
              ${clientFilter}
            GROUP BY dr.id, v.plate, d.name,
                     doc_info.customer_name, doc_info.client_ref, doc_info.order_number,
                     doc_info.delivery_date, doc_info.client_id, doc_info.plan_type, rr.name, dlp.un_code
            ORDER BY dr.created_at DESC
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-TRACKING] getReturnsTracking:', err.message);
        if (err.message?.includes('does not exist')) return res.json({ success: true, data: [] });
        res.status(500).json({ error: err.message });
    }
};

// ─── PUT /api/dispatch/delivery-returns/:id/advance ──────────────────────────
// Avanza el estado del pipeline: PRE_APPROVAL → PRE_APPROVED → SUPPLIER_EXIT → COMPLETED
export const advanceReturnState = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { newStatus, confirmedBy } = req.body;

        const validTransitions: Record<string, string> = {
            PRE_APPROVAL:  'CONFIRMED',
            PRE_APPROVED:  'PRE_APPROVAL',
            SUPPLIER_EXIT: 'PRE_APPROVED',
            COMPLETED:     'SUPPLIER_EXIT',
        };

        const fromStatus = validTransitions[newStatus];
        if (!fromStatus) return res.status(400).json({ error: `Estado '${newStatus}' no válido` });

        const auditFields: Record<string, string> = {
            PRE_APPROVAL:  `pre_approval_at = NOW(), pre_approval_by = $1`,
            PRE_APPROVED:  `pre_approved_at = NOW(), pre_approved_by = $1`,
            SUPPLIER_EXIT: `supplier_exit_at = NOW(), supplier_exit_by = $1`,
            COMPLETED:     `completed_at = NOW(), completed_by = $1`,
        };

        const result = await pool.query(`
            UPDATE delivery_returns
            SET status = '${newStatus}', ${auditFields[newStatus]}
            WHERE id::text = $2 AND status = '${fromStatus}'
            RETURNING id
        `, [confirmedBy || 'USUARIO', id]);

        if (!result.rowCount) return res.status(404).json({ error: 'Devolución no encontrada o estado incorrecto' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-TRACKING] advanceReturnState:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── PUT /api/dispatch/delivery-returns/:id/mark-excel-downloaded ─────────────
export const markExcelDownloaded = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query(
            `UPDATE delivery_returns SET excel_downloaded_at = NOW() WHERE id::text = $1`,
            [id]
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/dispatch/returns-for-invoice/:invoiceId ────────────────────────
// Devuelve las devoluciones de una factura (para mostrar en modal de conciliación)
export const getReturnsForInvoice = async (req: Request, res: Response) => {
    try {
        const inv = String(req.params.invoiceId || '').trim().toUpperCase();
        if (!inv) return res.status(400).json({ error: 'invoiceId requerido' });

        const result = await pool.query(`
            SELECT
                dr.id, dr.invoice_id, rr.name AS return_reason, dr.notes, dr.status,
                dr.created_at, dr.vendedor,
                dr.conciliacion_confirmada_at, dr.conciliacion_confirmada_by,
                v.plate  AS vehicle_plate,
                d.name   AS driver_name,
                COALESCE(json_agg(json_build_object(
                    'article_id',        dri.article_id,
                    'article_name',      art.name,
                    'quantity_returned', dri.quantity_returned,
                    'unit',              dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM delivery_returns dr
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            WHERE TRIM(UPPER(dr.invoice_id)) = $1
              AND dr.status IN ('PENDING','PROCESSED','CONFIRMED')
            GROUP BY dr.id, rr.name, v.plate, d.name
            ORDER BY dr.created_at DESC
        `, [inv]);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-RETURNS] getReturnsForInvoice:', err.message);
        if (err.message?.includes('does not exist')) return res.json({ success: true, data: [] });
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/delivery-returns/:id/confirm-facturacion ─────────────
// Facturación confirma una devolución → pasa a CONFIRMED
export const confirmReturnFacturacion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { confirmedBy } = req.body;
        const result = await pool.query(`
            UPDATE delivery_returns
            SET status = 'CONFIRMED',
                conciliacion_confirmada_at = NOW(),
                conciliacion_confirmada_by = $1
            WHERE id = $2 AND status IN ('PENDING','PROCESSED')
            RETURNING id
        `, [confirmedBy || 'FACTURACION', id]);
        if (!result.rowCount) return res.status(404).json({ error: 'Devolución no encontrada o ya confirmada' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-RETURNS] confirmReturnFacturacion:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/approval-batches/:id/confirm-doc-received ─────────────
// Marcar que se recibió el documento físico del proveedor
export const confirmDocReceived = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { confirmedBy } = req.body;
        const result = await pool.query(`
            UPDATE return_approval_batches
            SET status = 'doc_recibido',
                confirmed_at = COALESCE(confirmed_at, NOW()),
                confirmed_by_name = COALESCE(confirmed_by_name, $1)
            WHERE id::text = $2 AND status IN ('aprobado','aprobado_parcial','enviado')
            RETURNING id
        `, [confirmedBy || 'USUARIO', id]);
        if (!result.rowCount) return res.status(404).json({ error: 'Lote no encontrado o en estado no válido' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-BATCH] confirmDocReceived:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/dispatch/approval-batches ──────────────────────────────────────
// Lista lotes de aprobación de un cliente
export const getApprovalBatches = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [];
        let whereClause = '';
        if (clientId) { params.push(clientId); whereClause = `WHERE rab.client_id = $1`; }

        const result = await pool.query(`
            SELECT
                rab.id, rab.batch_code, rab.client_id, rab.notes, rab.status,
                rab.created_by, rab.created_at, rab.sent_at,
                rab.email_proveedor, rab.email_sent_at,
                rab.confirmed_at, rab.confirmed_by_name,
                rab.proveedor_confirmed_at, rab.proveedor_confirmed_by,
                COUNT(rabi.id)::int AS total_items,
                COUNT(rabi.id) FILTER (WHERE rabi.approved = true)::int AS approved_items
            FROM return_approval_batches rab
            LEFT JOIN return_approval_batch_items rabi ON rabi.batch_id::text = rab.id::text
            ${whereClause}
            GROUP BY rab.id
            ORDER BY rab.created_at DESC
        `, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-BATCH] getApprovalBatches:', err.message);
        if (err.message?.includes('does not exist')) return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /api/dispatch/approval-batch/:batchCode ─────────────────────────────
// Detalle completo de un lote (para salida a proveedor)
export const getApprovalBatchByCode = async (req: Request, res: Response) => {
    try {
        const { batchCode } = req.params;
        const batchRes = await pool.query(
            `SELECT * FROM return_approval_batches WHERE batch_code = $1 LIMIT 1`,
            [batchCode]
        );
        if (!batchRes.rowCount) return res.status(404).json({ success: false, error: 'Lote no encontrado' });
        const batch = batchRes.rows[0];

        const itemsRes = await pool.query(`
            SELECT
                rabi.id, rabi.invoice_id, rabi.return_reason, rabi.approved, rabi.approval_notes,
                dr.notes, dr.status AS return_status, dr.created_at AS return_date,
                v.plate AS vehicle_plate,
                d.name  AS driver_name,
                COALESCE(json_agg(json_build_object(
                    'article_id',        dri.article_id,
                    'article_name',      art.name,
                    'quantity_returned', dri.quantity_returned,
                    'unit',              dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM return_approval_batch_items rabi
            LEFT JOIN delivery_returns dr ON dr.id::text = rabi.return_id::text
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            WHERE rabi.batch_id::text = $1
            GROUP BY rabi.id, dr.notes, dr.status, dr.created_at, v.plate, d.name
            ORDER BY rabi.invoice_id
        `, [String(batch.id)]);

        res.json({ success: true, batch, items: itemsRes.rows });
    } catch (err: any) {
        console.error('[M7-BATCH] getApprovalBatchByCode:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};


export const getUnifiedHistory = async (req: Request, res: Response) => {
    const { invoiceId, driverId, vehicleId, dateFrom, dateTo, page = '1', limit = '50' } = req.query as Record<string, string>;
    
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (invoiceId)  { conditions.push(`ri.invoice_id ILIKE $${idx++}`);  params.push(`%${invoiceId}%`); }
    if (req.query.documentL) { conditions.push(`(doc.id ILIKE $${idx} OR doc.external_doc_id ILIKE $${idx})`); params.push(`%${req.query.documentL}%`); idx++; }
    if (driverId)   { conditions.push(`r.driver_id::text = $${idx++}`);        params.push(driverId); }
    if (vehicleId)  { conditions.push(`r.vehicle_id::text = $${idx++}`);       params.push(vehicleId); }
    if (dateFrom)   { conditions.push(`r.created_at >= $${idx++}`);      params.push(dateFrom); }
    if (dateTo)     { conditions.push(`r.created_at <= $${idx++}`);      params.push(dateTo); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const query = `
            SELECT 
                ri.route_id::text AS operation_id,
                ri.invoice_id,
                r.driver_id,
                d.name AS driver_name,
                r.vehicle_id,
                v.plate AS vehicle_plate,
                r.created_at AS route_created_at,
                e.name AS status_name,
                COALESCE(doc.id, ri.invoice_id) AS documento_l,
                MAX(di.customer_name) AS client_name,
                MAX(di.address) AS address,
                MAX(di.city) AS city
            FROM route_invoices ri
            JOIN routes r ON r.id::text = ri.route_id::text
            LEFT JOIN drivers d ON d.id::text = r.driver_id::text
            LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
            LEFT JOIN estados e ON e.id::text = r.status_id::text
            LEFT JOIN (
                SELECT 
                    TRIM(COALESCE(NULLIF(invoice,''), order_number)) AS invoice_number,
                    MAX(customer_name) AS customer_name,
                    MAX(address) AS address,
                    MAX(city) AS city,
                    MAX(document_id) AS document_id
                FROM document_items
                GROUP BY TRIM(COALESCE(NULLIF(invoice,''), order_number))
            ) di ON di.invoice_number = ri.invoice_id
            LEFT JOIN documents_l doc ON doc.id = di.document_id OR ri.invoice_id = doc.id::text OR ri.invoice_id = doc.external_doc_id
            LEFT JOIN clients c ON c.id::text = doc.client_id::text
            ${where}
            GROUP BY ri.route_id, ri.invoice_id, r.driver_id, d.name, r.vehicle_id, v.plate, r.created_at, e.name, COALESCE(doc.id, ri.invoice_id)
            ORDER BY r.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `;

        const countQuery = `
            SELECT COUNT(*) 
            FROM route_invoices ri
            JOIN routes r ON r.id::text = ri.route_id::text
            LEFT JOIN (
                SELECT 
                    TRIM(COALESCE(NULLIF(invoice,''), order_number)) AS invoice_number,
                    MAX(document_id) AS document_id
                FROM document_items
                GROUP BY TRIM(COALESCE(NULLIF(invoice,''), order_number))
            ) di ON di.invoice_number = ri.invoice_id
            LEFT JOIN documents_l doc ON doc.id = di.document_id OR ri.invoice_id = doc.id::text OR ri.invoice_id = doc.external_doc_id
            ${where}
        `;

        const [dataRes, countRes] = await Promise.all([
            pool.query(query, [...params, parseInt(limit), offset]),
            pool.query(countQuery, params)
        ]);

        res.json({
            success: true,
            data: dataRes.rows,
            total: parseInt(countRes.rows[0].count)
        });
    } catch (err: any) {
        console.error('[UNIFIED-HISTORY-ERR]', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getHistoryFiltersData = async (req: Request, res: Response) => {
    try {
        const dRes = await pool.query(`SELECT DISTINCT d.id, d.name FROM assignments a JOIN drivers d ON d.id::text = a.driver_id::text`);
        const vRes = await pool.query(`SELECT DISTINCT v.id, v.plate FROM assignments a JOIN vehicles v ON v.id::text = a.vehicle_id::text`);
        res.json({ success: true, drivers: dRes.rows, vehicles: vRes.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /api/dispatch/bodega-returns-history ─────────────────────────────────
// Historial de devoluciones registradas por bodega — para DataTable y export Excel
export const getBodegaReturnsHistory = async (req: Request, res: Response) => {
    try {
        const { clientId, dateFrom, dateTo } = req.query as Record<string, string>;
        const params: any[] = [];
        const filters: string[] = [];

        if (clientId) {
            params.push(clientId);
            filters.push(`dl.client_id = $${params.length}`);
        }
        if (dateFrom) {
            params.push(dateFrom);
            filters.push(`dr.created_at::date >= $${params.length}`);
        }
        if (dateTo) {
            params.push(dateTo);
            filters.push(`dr.created_at::date <= $${params.length}`);
        }

        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const result = await pool.query(`
            SELECT
                dri.id,
                dr.id                                  AS return_id,
                dr.created_at::date                    AS fecha,
                di.customer_name,
                di.client_ref                          AS codigo_cliente,
                dr.vendedor,
                dl.delivery_date::date                 AS fecha_placa,
                v.plate                                AS placa,
                dr.numero_planilla,
                dr.invoice_id                          AS remision,
                di.order_number                        AS pedido,
                dri.article_id                         AS referencia,
                COALESCE(dlp.un_code, di.un_code, dri.un_code) AS un_code,
                COALESCE(di.unit, dri.unit)            AS um,
                dri.quantity_returned                  AS cantidad,
                rr.name                                AS motivo_devolucion,
                dl.plan_type                           AS unidad_negocio,
                dr.status,
                dr.conciliacion_confirmada_at,
                dr.conciliacion_confirmada_by,
                dr.pre_approval_at,
                dr.pre_approval_by,
                dr.pre_approved_at,
                dr.pre_approved_by,
                dr.supplier_exit_at,
                dr.supplier_exit_by,
                dr.completed_at,
                dr.completed_by,
                batch.batch_code,
                batch.status                           AS batch_status,
                batch.confirmed_at                     AS proveedor_confirmed_at
            FROM delivery_returns dr
            JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN return_reasons rr ON rr.id = dr.reason_id
            LEFT JOIN document_items di
                   ON TRIM(UPPER(COALESCE(di.invoice, di.order_number))) = TRIM(UPPER(dr.invoice_id))
                  AND TRIM(UPPER(di.article_id)) = TRIM(UPPER(dri.article_id))
            LEFT JOIN document_l_payments dlp
                   ON TRIM(UPPER(dlp.invoice)) = TRIM(UPPER(dr.invoice_id))
            LEFT JOIN documents_l dl ON dl.id = di.document_id
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN return_approval_batch_items rabi ON rabi.return_id::text = dr.id::text
            LEFT JOIN return_approval_batches batch ON batch.id = rabi.batch_id
            ${where}
            ORDER BY dr.created_at DESC, dri.article_id
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-DEVOL-HIST]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/returns/:id/confirm-conciliation ──────────────────────
// Conciliación confirma que ya revisó y acepta la devolución registrada por bodega
export const confirmReturnConciliation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { confirmedBy, valor, observaciones } = req.body;

        // Actualizar cabecera de la devolución
        await pool.query(`
            UPDATE delivery_returns
            SET conciliacion_confirmada_at = NOW(),
                conciliacion_confirmada_by = $1,
                status = 'CONCILIADO',
                notes = CASE WHEN $3::text != '' THEN COALESCE(notes,'') || E'\n[Conciliación]: ' || $3 ELSE notes END
            WHERE id::text = $2
        `, [confirmedBy || null, String(id), observaciones || '']);

        res.json({ success: true });
    } catch (err: any) {
        console.error('[M7-DEVOL-CONCIL]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/approval-batches/:id/send-email ──────────────────────
// Envía email al proveedor con link de confirmación y genera token
export const sendApprovalBatchEmail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { email_proveedor, nombre_proveedor } = req.body;

        if (!email_proveedor) return res.status(400).json({ error: 'email_proveedor es requerido' });

        const batchRes = await pool.query(`SELECT * FROM return_approval_batches WHERE id::text = $1`, [id]);
        if (!batchRes.rowCount) return res.status(404).json({ error: 'Lote no encontrado' });
        const batch = batchRes.rows[0];

        // Generar token único + vencimiento 7 días
        const token = uuidv4().replace(/-/g, '');
        const vencimiento = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Obtener ítems del lote con detalle de artículos
        const itemsRes = await pool.query(`
            SELECT
                rabi.id, rabi.invoice_id, rabi.return_reason, rabi.return_type,
                dr.notes,
                v.plate AS vehicle_plate,
                d.name AS driver_name,
                COALESCE(json_agg(json_build_object(
                    'sku', COALESCE(art.sku, dri.article_id),
                    'article_name', COALESCE(art.name, dri.article_id),
                    'quantity_returned', dri.quantity_returned,
                    'unit', dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM return_approval_batch_items rabi
            LEFT JOIN delivery_returns dr ON dr.id::text = rabi.return_id::text
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            WHERE rabi.batch_id::text = $1
            GROUP BY rabi.id, dr.notes, dr.status, dr.created_at, v.plate, d.name
            ORDER BY rabi.invoice_id
        `, [id]);

        const appUrl = process.env.APP_URL || 'https://orbitm7.m7apps.com';
        const link = `${appUrl}/public/return-approval/${batch.batch_code}/${token}`;
        const fechaVenc = vencimiento.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

        // Construir tabla de ítems HTML
        const filasItems = itemsRes.rows.map((item: any) => {
            const arts = Array.isArray(item.items) ? item.items : [];
            const artRows = arts.length
                ? arts.map((a: any) => `<tr>
                    <td style="padding:6px 10px;font-size:11px;color:#64748b">${item.invoice_id}</td>
                    <td style="padding:6px 10px;font-size:11px;color:#64748b">${a.sku || '—'}</td>
                    <td style="padding:6px 10px;font-size:12px;font-weight:700;color:#1e293b">${a.article_name || '—'}</td>
                    <td style="padding:6px 10px;font-size:12px;text-align:center;color:#0d3b3b;font-weight:800">${a.quantity_returned} ${a.unit || ''}</td>
                    <td style="padding:6px 10px;font-size:11px;color:#64748b">${item.return_reason || '—'}</td>
                  </tr>`).join('')
                : `<tr><td colspan="5" style="padding:8px 10px;font-size:11px;color:#94a3b8">Sin artículos registrados</td></tr>`;
            return artRows;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Solicitud de Aprobación — Devoluciones ${batch.batch_code}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<div style="max-width:680px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#064e3b 100%);padding:32px 36px 28px">
    <div style="font-size:11px;font-weight:900;color:#6ee7b7;text-transform:uppercase;letter-spacing:3px;margin-bottom:10px">
      Milla 7 S.A.S. — OrbitM7
    </div>
    <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 6px;text-transform:uppercase">
      Solicitud de Aprobación de Devoluciones
    </h1>
    <p style="color:#94a3b8;font-size:12px;margin:0">Lote: <strong style="color:#6ee7b7">${batch.batch_code}</strong></p>
  </div>

  <!-- Body -->
  <div style="padding:32px 36px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">
      Estimado(a) <strong>${nombre_proveedor || 'Proveedor'}</strong>,<br><br>
      Le informamos que hemos registrado las siguientes devoluciones de mercancía en nuestro sistema.
      Por favor revise los detalles y confirme el recibido a través del enlace al final de este correo.
    </p>

    <!-- Tabla ítems -->
    <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#0f172a">
            <th style="padding:10px;font-size:10px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;text-align:left">Factura</th>
            <th style="padding:10px;font-size:10px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;text-align:left">SKU</th>
            <th style="padding:10px;font-size:10px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;text-align:left">Artículo</th>
            <th style="padding:10px;font-size:10px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;text-align:center">Cant.</th>
            <th style="padding:10px;font-size:10px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;text-align:left">Motivo</th>
          </tr>
        </thead>
        <tbody>${filasItems || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;font-size:12px">Sin ítems en este lote</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Info lote -->
    <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:28px;border:1px solid #e2e8f0">
      <div style="display:flex;gap:32px;flex-wrap:wrap">
        <div><span style="display:block;font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Total facturas</span>
          <strong style="font-size:16px;color:#0f172a">${itemsRes.rowCount}</strong></div>
        <div><span style="display:block;font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Link válido hasta</span>
          <strong style="font-size:13px;color:#dc2626">${fechaVenc}</strong></div>
        <div><span style="display:block;font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Código lote</span>
          <strong style="font-size:13px;color:#0f172a;font-family:monospace">${batch.batch_code}</strong></div>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:28px">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#fff;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;padding:16px 40px;border-radius:12px;text-decoration:none;box-shadow:0 4px 16px rgba(5,150,105,0.3)">
        ✓ Confirmar Recibo de Devoluciones
      </a>
      <p style="font-size:10px;color:#94a3b8;margin:12px 0 0">O copia este enlace en tu navegador:<br>
        <span style="color:#059669;font-family:monospace;font-size:10px;word-break:break-all">${link}</span>
      </p>
    </div>

    <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 20px"/>
    <p style="font-size:11px;color:#94a3b8;margin:0">
      Este correo fue generado automáticamente por <strong>OrbitM7 — Milla 7 S.A.S.</strong><br>
      Soporte: <a href="mailto:directorti@millasiete.com" style="color:#059669">directorti@millasiete.com</a> | WhatsApp: 3011825161
    </p>
  </div>
</div>
</body></html>`;

        // Guardar token y email en BD
        await pool.query(`
            UPDATE return_approval_batches
            SET email_proveedor=$1, token_confirmacion=$2, vencimiento_token=$3,
                email_sent_at=NOW(), status='enviado'
            WHERE id::text=$4
        `, [email_proveedor, token, vencimiento, id]);

        await sendEmail(
            email_proveedor,
            `Solicitud de Aprobación de Devoluciones — ${batch.batch_code}`,
            html
        );

        res.json({ success: true, batch_code: batch.batch_code, email: email_proveedor, vencimiento });
    } catch (err: any) {
        console.error('[M7-DEVOL-EMAIL]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /public/return-approval/:batchCode/:token (sin auth) ─────────────────
export const getPublicReturnApproval = async (req: Request, res: Response) => {
    try {
        const { batchCode, token } = req.params;
        const batchRes = await pool.query(
            `SELECT * FROM return_approval_batches WHERE batch_code=$1 AND token_confirmacion=$2`,
            [batchCode, token]
        );
        if (!batchRes.rowCount) return res.status(404).json({ error: 'Enlace inválido o no encontrado' });
        const batch = batchRes.rows[0];

        if (batch.vencimiento_token && new Date(batch.vencimiento_token) < new Date()) {
            return res.status(410).json({ error: 'Este enlace ha vencido. Contacte a Milla 7.' });
        }

        const itemsRes = await pool.query(`
            SELECT
                rabi.id, rabi.invoice_id, rabi.return_reason, rabi.return_type,
                rabi.approved, rabi.approval_notes, rabi.approved_at, rabi.approved_by_name,
                dr.notes,
                v.plate AS vehicle_plate,
                d.name  AS driver_name,
                COALESCE(json_agg(json_build_object(
                    'sku', COALESCE(art.sku, dri.article_id),
                    'article_name', COALESCE(art.name, dri.article_id),
                    'quantity_returned', dri.quantity_returned, 'unit', dri.unit
                )) FILTER (WHERE dri.id IS NOT NULL), '[]') AS items
            FROM return_approval_batch_items rabi
            LEFT JOIN delivery_returns dr ON dr.id::text = rabi.return_id::text
            LEFT JOIN vehicles v ON v.id::text = dr.vehicle_id::text
            LEFT JOIN drivers d ON d.id::text = dr.driver_id::text
            LEFT JOIN delivery_return_items dri ON dri.return_id::text = dr.id::text
            LEFT JOIN articles art ON art.id::text = dri.article_id
            WHERE rabi.batch_id::text = $1
            GROUP BY rabi.id, dr.notes, dr.status, dr.created_at, v.plate, d.name
            ORDER BY rabi.invoice_id
        `, [String(batch.id)]);

        // No devolver el token en la respuesta
        const { token_confirmacion: _t, ...batchSafe } = batch;
        res.json({ success: true, batch: batchSafe, items: itemsRes.rows });
    } catch (err: any) {
        console.error('[M7-DEVOL-PUBLIC]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /public/return-approval/:batchCode/:token/confirm (sin auth) ────────
export const confirmPublicReturnApproval = async (req: Request, res: Response) => {
    try {
        const { batchCode, token } = req.params;
        const { nombre_confirmador, observaciones_generales, items } = req.body;
        // items: [{ id, approved: boolean, approval_notes: string }]

        const batchRes = await pool.query(
            `SELECT * FROM return_approval_batches WHERE batch_code=$1 AND token_confirmacion=$2`,
            [batchCode, token]
        );
        if (!batchRes.rowCount) return res.status(404).json({ error: 'Enlace inválido' });
        const batch = batchRes.rows[0];

        if (batch.vencimiento_token && new Date(batch.vencimiento_token) < new Date()) {
            return res.status(410).json({ error: 'Este enlace ha vencido' });
        }
        if (batch.confirmed_at) {
            return res.status(409).json({ error: 'Este lote ya fue confirmado', confirmed_at: batch.confirmed_at });
        }

        // Actualizar cada ítem
        if (Array.isArray(items)) {
            for (const item of items) {
                await pool.query(`
                    UPDATE return_approval_batch_items
                    SET approved=$1, approval_notes=$2, approved_at=NOW(), approved_by_name=$3
                    WHERE id::text=$4
                `, [item.approved, item.approval_notes || null, nombre_confirmador || 'Proveedor', String(item.id)]);
            }
        }

        // Verificar si todos los ítems fueron aprobados
        const checkRes = await pool.query(
            `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE approved=true) as aprobados
             FROM return_approval_batch_items WHERE batch_id::text=$1`, [String(batch.id)]
        );
        const { total, aprobados } = checkRes.rows[0];
        const nuevoStatus = parseInt(aprobados) === parseInt(total) ? 'aprobado' : 'aprobado_parcial';

        await pool.query(`
            UPDATE return_approval_batches
            SET status=$1, confirmed_at=NOW(), confirmed_by_name=$2,
                notes = COALESCE(notes,'') || CASE WHEN $3::text != '' THEN E'\n[Proveedor]: ' || $3 ELSE '' END
            WHERE id::text=$4
        `, [nuevoStatus, nombre_confirmador || 'Proveedor', observaciones_generales || '', String(batch.id)]);

        console.log(`[M7-DEVOL] Lote ${batchCode} confirmado por ${nombre_confirmador} — status: ${nuevoStatus}`);
        res.json({ success: true, status: nuevoStatus, total, aprobados });
    } catch (err: any) {
        console.error('[M7-DEVOL-CONFIRM]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/dispatch/delivery-returns/conciliacion-pending ─────────────────
// Facturas con DEVUELTO en conciliación que NO tienen delivery_returns registrado
export const getConciliacionPending = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.query as Record<string, string>;
        const params: any[] = [];
        let clientFilter = '';
        if (clientId) { params.push(clientId); clientFilter = `AND dl.client_id = $${params.length}`; }

        const result = await pool.query(`
            SELECT
                TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number))) AS invoice_id,
                MAX(di.customer_name)              AS customer_name,
                MAX(di.client_ref)                 AS codigo_cliente,
                MAX(dl.delivery_date::date)        AS fecha_placa,
                MAX(dl.plan_type)                  AS plan_type,
                MAX(dl.client_id)                  AS client_id,
                MAX(dl.vehicle_plate)              AS vehicle_plate,
                MAX(v.id::text)                    AS vehicle_id,
                MAX(drv.id::text)                  AS driver_id,
                MAX(drv.name)                      AS driver_name,
                MAX(dl.external_doc_id)            AS numero_planilla,
                (CASE WHEN COUNT(di.id) = MAX(inv_total.total_count) THEN 'COMPLETA' ELSE 'PARCIAL' END) AS return_type,
                COALESCE(json_agg(json_build_object(
                    'article_id',        di.article_id,
                    'article_name',      COALESCE(art.name, di.article_id),
                    'sku',               di.article_id,
                    'un_code',           di.un_code,
                    'unit',              COALESCE(NULLIF(di.unit,''), 'UND'),
                    'quantity_returned', COALESCE(di.expected_qty, 0)
                )) FILTER (WHERE di.article_id IS NOT NULL), '[]') AS items
            FROM document_items di
            JOIN documents_l dl ON dl.id = di.document_id
            LEFT JOIN articles art ON art.id::text = di.article_id
            LEFT JOIN vehicles v ON v.plate = dl.vehicle_plate
            LEFT JOIN assignments asgn ON asgn.vehicle_id::text = v.id::text AND asgn.is_active = true
            LEFT JOIN drivers drv ON drv.id::text = asgn.driver_id::text
            LEFT JOIN (
                SELECT TRIM(UPPER(COALESCE(NULLIF(di2.invoice,''), di2.order_number))) AS invoice_id, COUNT(*) AS total_count
                FROM document_items di2
                GROUP BY TRIM(UPPER(COALESCE(NULLIF(di2.invoice,''), di2.order_number)))
            ) inv_total ON inv_total.invoice_id = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
            WHERE di.item_status IN ('EST-13','DEVUELTO','DEVUELT')
              AND NOT EXISTS (
                  SELECT 1 FROM delivery_returns dr
                  WHERE TRIM(UPPER(dr.invoice_id)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
              )
              ${clientFilter}
            GROUP BY TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
            ORDER BY MAX(dl.delivery_date) DESC
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[M7-CONCIL-PENDING]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/delivery-returns/import-from-conciliacion ────────────
// Crea delivery_returns en estado CONFIRMED para facturas que ya pasaron por conciliación
export const importFromConciliacion = async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { invoices, importedBy } = req.body as {
            invoices: Array<{
                invoice_id: string; vehicle_id?: string; driver_id?: string;
                vendedor?: string; numero_planilla?: string; fecha_placa?: string;
                return_reason?: string; return_type?: string;
                items: Array<{ article_id: string; article_name?: string; sku?: string; un_code?: string; unit?: string; quantity_returned: number }>;
            }>;
            importedBy: string;
        };

        if (!Array.isArray(invoices) || invoices.length === 0)
            return res.status(400).json({ error: 'Se requiere al menos una factura' });

        await client.query('BEGIN');
        const created: number[] = [];

        for (const inv of invoices) {
            // Evitar duplicados — verificar que no exista ya
            const exists = await client.query(
                `SELECT id FROM delivery_returns WHERE TRIM(UPPER(invoice_id)) = $1 LIMIT 1`,
                [inv.invoice_id.trim().toUpperCase()]
            );
            if (exists.rows.length > 0) continue;

            const rsnId = await resolveReasonId(inv.return_reason || 'DEVOLUCION CONCILIACION', client);
            const retRes = await client.query(
                `INSERT INTO delivery_returns
                    (invoice_id, vehicle_id, driver_id, reason_id, return_type, status,
                     vendedor, numero_planilla, fecha_placa,
                     conciliacion_confirmada_at, conciliacion_confirmada_by, created_at)
                 VALUES ($1,$2,$3,$4,$5,'CONFIRMED',$6,$7,$8,NOW(),$9,NOW())
                 RETURNING id`,
                [
                    inv.invoice_id.trim().toUpperCase(),
                    inv.vehicle_id || null,
                    inv.driver_id  || null,
                    rsnId,
                    inv.return_type || 'COMPLETA',
                    inv.vendedor || null,
                    inv.numero_planilla || null,
                    inv.fecha_placa || null,
                    importedBy || 'CONCILIACION',
                ]
            );
            const returnId = retRes.rows[0].id;
            created.push(returnId);

            for (const item of (inv.items || [])) {
                const qty = Number(item.quantity_returned ?? 0);
                if (qty <= 0) continue;
                await client.query(
                    `INSERT INTO delivery_return_items
                        (return_id, article_id, un_code, quantity_returned, unit)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [
                        returnId,
                        item.article_id || null,
                        item.un_code || null,
                        qty,
                        item.unit || 'UND',
                    ]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, created: created.length, ids: created });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[M7-IMPORT-CONCIL]', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// ─── GET /api/dispatch/return-reasons ────────────────────────────────────────
export const getReturnReasons = async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, name FROM return_reasons WHERE is_active = true ORDER BY id`
        );
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /api/dispatch/return-reasons ───────────────────────────────────────
export const createReturnReason = async (req: Request, res: Response) => {
    try {
        const { name } = req.body as { name: string };
        if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' });
        const result = await pool.query(
            `INSERT INTO return_reasons (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET is_active = true
             RETURNING id, name`,
            [name.trim()]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
