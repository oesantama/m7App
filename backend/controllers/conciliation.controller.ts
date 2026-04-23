
import { Request, Response } from 'express';
import pool from '../config/database.js';
// @ts-ignore – xlsx está instalado en el servidor; no hay node_modules local
import * as XLSX from 'xlsx';
import { readFileSync, unlink } from 'fs';

// ─── GET /conciliation/pending ───────────────────────────────────────────────
// Documentos Plan R con estado EST-12 (entregado) o EST-13 (parcial) que aún
// no tienen conciliación completa (al menos 1 factura sin conciliar).
export const getPendingConciliations = async (req: Request, res: Response) => {
    try {
        const { clientId, plate, from, to } = req.query;

        const conditions: string[] = [`dl.plan_type ILIKE '%plan r%'`];
        const params: any[] = [];
        let p = 1;

        if (clientId) { conditions.push(`dl.client_id = $${p++}`); params.push(clientId); }
        if (plate)    { conditions.push(`dl.vehicle_plate ILIKE $${p++}`); params.push(`%${plate}%`); }
        if (from)     { conditions.push(`dl.created_at >= $${p++}`); params.push(from); }
        if (to)       { conditions.push(`dl.created_at <= $${p++}`); params.push(to); }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // [M7-SELF-HEALING] Asegurar que la tabla de sobrecostos existe antes de consultar
        await pool.query(`
            CREATE TABLE IF NOT EXISTS route_surcharges (
                id SERIAL PRIMARY KEY,
                document_id TEXT NOT NULL,
                plate TEXT NOT NULL,
                valor NUMERIC(15,2) NOT NULL,
                referencia TEXT,
                fecha DATE,
                status_id TEXT DEFAULT 'PENDIENTE',
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // [M7-SELF-HEALING] Tabla para Consignaciones Grupales (por Ruta/Placa, sin factura)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS route_group_payments (
                id SERIAL PRIMARY KEY,
                document_id TEXT NOT NULL,
                plate TEXT NOT NULL,
                valor NUMERIC(15,2) NOT NULL,
                referencia TEXT,
                fecha DATE,
                metodo_pago TEXT,
                observacion TEXT,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Garantizar que la columna user_id existe
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='route_surcharges' AND column_name='user_id') THEN
                    ALTER TABLE route_surcharges ADD COLUMN user_id TEXT;
                END IF;
            END $$;
        `);

        const result = await pool.query(`
            SELECT
                dl.id,
                dl.external_doc_id,
                dl.vehicle_plate,
                dl.codplan,
                dl.plan_type,
                dl.status,
                dl.created_at,
                dl.delivery_date,
                dl.client_id,

                -- Conteo de facturas en el documento (Subquery para evitar fan-out de joins)
                (SELECT COUNT(DISTINCT di.invoice) 
                 FROM document_items di 
                 WHERE di.document_id = dl.id AND di.invoice IS NOT NULL AND di.invoice <> ''
                ) AS total_invoices,

                (SELECT COUNT(DISTINCT ic.invoice_number)
                 FROM invoice_conciliations ic
                 WHERE ic.document_id = dl.id
                ) AS conciliadas,

                -- Efectivo y crédito desde document_l_payments (Subquery para evitar fan-out)
                (SELECT COALESCE(SUM(CASE 
                    WHEN UPPER(TRIM(p.metodo_pago)) LIKE '%EFECTIVO%' OR UPPER(TRIM(p.metodo_pago)) LIKE '%EFE%'
                    THEN COALESCE(NULLIF(TRIM(p.vmetodo), '')::numeric, 0) ELSE 0 END), 0)
                 FROM document_l_payments p
                 WHERE p.invoice IS NOT NULL AND TRIM(UPPER(p.invoice)) IN (
                    SELECT DISTINCT TRIM(UPPER(di2.invoice)) 
                    FROM document_items di2 
                    WHERE di2.document_id = dl.id AND di2.invoice IS NOT NULL AND di2.invoice <> ''
                 )
                ) AS total_efectivo,

                (SELECT COALESCE(SUM(CASE 
                    WHEN p.metodo_pago IS NOT NULL
                         AND UPPER(TRIM(p.metodo_pago)) NOT LIKE '%EFECTIVO%'
                         AND UPPER(TRIM(p.metodo_pago)) NOT LIKE '%EFE%'
                    THEN COALESCE(NULLIF(TRIM(p.vmetodo), '')::numeric, 0) ELSE 0 END), 0)
                 FROM document_l_payments p
                 WHERE p.invoice IS NOT NULL AND TRIM(UPPER(p.invoice)) IN (
                    SELECT DISTINCT TRIM(UPPER(di2.invoice)) 
                    FROM document_items di2 
                    WHERE di2.document_id = dl.id AND di2.invoice IS NOT NULL AND di2.invoice <> ''
                 )
                ) AS total_credito,

                -- Conductor y placa desde dispatch (última asignación del doc)
                (SELECT da.driver_id FROM dispatch_assignments da
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_id,
                (SELECT u.name FROM dispatch_assignments da
                 LEFT JOIN users u ON u.id = da.driver_id
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_name,

                -- Sobrecostos de ruta acumulados
                (SELECT COALESCE(SUM(valor), 0) FROM route_surcharges rs WHERE rs.document_id = dl.id) AS total_sobrecosto_ruta,

                -- Pagos grupales acumulados
                (SELECT COALESCE(SUM(valor), 0) FROM route_group_payments rgp WHERE rgp.document_id = dl.id) AS total_pago_grupal

            FROM documents_l dl
            ${where}
            -- El filtro de "al menos una pendiente" se aplica en el HAVING del resultado final o simplemente se filtra aquí
            GROUP BY dl.id, dl.external_doc_id, dl.vehicle_plate, dl.codplan, dl.plan_type, dl.status, dl.created_at, dl.delivery_date, dl.client_id
            HAVING (
                (SELECT COUNT(DISTINCT di.invoice) FROM document_items di WHERE di.document_id = dl.id AND di.invoice IS NOT NULL AND di.invoice <> '')
                - 
                (SELECT COUNT(DISTINCT ic.invoice_number) FROM invoice_conciliations ic WHERE ic.document_id = dl.id)
            ) > 0
              AND (SELECT COUNT(DISTINCT di.invoice) FROM document_items di WHERE di.document_id = dl.id AND di.invoice IS NOT NULL AND di.invoice <> '') > 0
            ORDER BY dl.created_at DESC
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[CONCILIATION] getPendingConciliations error:', err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno del servidor', 
            details: err.message,
            hint: 'Verifique si la tabla route_surcharges existe'
        });
    }
};

// ─── GET /conciliation/search-routes ─────────────────────────────────────────
// Consulta directa a tabla routes por cliente y fecha.
// Retorna placa (vehicles), conductor (drivers), estado (estados), total facturas.
export const searchRoutesForPlanilla = async (req: Request, res: Response) => {
    try {
        const { clientId, date } = req.query;
        if (!clientId || !date) {
            return res.status(400).json({ success: false, error: 'clientId y date son requeridos' });
        }

        const result = await pool.query(`
            SELECT
                r.id,
                r.created_at::date                                  AS date,
                r.vehicle_capacity_m3,
                v.plate                                             AS vehicle_plate,
                v.capacity_m3,
                d.name                                              AS conductor_name,
                e.name                                              AS estado,
                r.status_id,
                COUNT(ri.invoice_id)                               AS total_invoices,
                (SELECT COUNT(*)
                 FROM route_invoices ri2
                 JOIN document_items di2
                   ON TRIM(COALESCE(NULLIF(di2.invoice,''), di2.order_number)) = ri2.invoice_id
                   OR CONCAT(di2.document_id::text, '_', COALESCE(NULLIF(di2.invoice,''), di2.order_number)) = ri2.invoice_id
                 JOIN invoice_conciliations ic2
                   ON ic2.document_id::text = di2.document_id::text
                  AND ic2.invoice_number    = di2.invoice
                  AND ic2.forma_pago IS NOT NULL
                 WHERE ri2.route_id::text = r.id::text
                ) AS conciliadas
            FROM routes r
            LEFT JOIN vehicles       v  ON v.id::text       = r.vehicle_id::text
            LEFT JOIN drivers        d  ON d.id::text       = r.driver_id::text
            LEFT JOIN estados        e  ON e.id             = r.status_id
            LEFT JOIN route_invoices ri ON ri.route_id::text = r.id::text
            WHERE r.created_at::date = $1::date
            GROUP BY r.id, v.plate, v.capacity_m3, d.name, e.name, r.status_id, r.vehicle_capacity_m3, r.created_at
            HAVING COUNT(ri.invoice_id) > 0
            ORDER BY r.created_at DESC
        `, [date]);

        // Agregar campo external_doc_id como alias del id de ruta para compatibilidad con el frontend
        const rows = result.rows.map(r => ({
            ...r,
            external_doc_id: `RUTA-${r.id}`,
        }));

        res.json({ success: true, data: rows });
    } catch (err: any) {
        console.error('[CONCILIATION] searchRoutesForPlanilla error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /conciliation/:documentId ───────────────────────────────────────────
// Detalle de un documento: facturas + estado de conciliación de cada una.
export const getConciliationByDocument = async (req: Request, res: Response) => {
    const { documentId } = req.params;
    try {
        // Info del documento
        const docRes = await pool.query(`
            SELECT dl.*,
                   u.name AS created_by_name
            FROM documents_l dl
            LEFT JOIN users u ON u.id = dl.created_by
            WHERE dl.id = $1
        `, [documentId]);

        if (!docRes.rows.length) {
            return res.status(404).json({ success: false, error: 'Documento no encontrado' });
        }

        const doc = docRes.rows[0];

        // Base del SELECT para facturas — compartido entre query con/sin MasterSuite
        const baseInvoiceSelect = `
            SELECT
                di.invoice                                  AS invoice_number,
                di.customer_name,
                di.city,
                di.address,
                SUM(COALESCE(di.expected_qty, 0))           AS total_qty,
                ic.id                                       AS conciliation_id,
                ic.banco,
                ic.valor,
                ic.comprobante,
                ic.fecha_pago,
                ic.forma_pago,
                ic.numero_cheque,
                ic.es_devolucion,
                ic.conciliado_por,
                ic.conductor_id,
                ic.conductor_name,
                ic.vehicle_plate,
                ic.bodega_received_at,
                COALESCE(ic.sobrecosto::numeric, 0)         AS sobrecosto,
                ic.created_at                               AS conciliado_at,
                u.name                                      AS conciliado_por_nombre,
                MAX(p.vmetodo)                              AS invoice_value,
                MAX(p.metodo_pago)                          AS invoice_metodo_pago,
                MAX(di.item_status)                         AS item_status,
                MAX(COALESCE(v2.plate, r2.vehicle_id::text)) AS route_vehicle_plate,
                (SELECT json_agg(json_build_object(
                    'id', di2.id,
                    'article_id', di2.article_id,
                    'article_name', a.name,
                    'qty', di2.expected_qty,
                    'unit', di2.unit,
                    'returned_qty', (
                        SELECT SUM(dri.quantity_returned)
                        FROM delivery_return_items dri
                        JOIN delivery_returns dr ON dr.id = dri.return_id
                        WHERE TRIM(UPPER(dr.invoice_id)) = TRIM(UPPER(di2.invoice))
                          AND dri.sku = di2.article_id
                          AND dr.status <> 'CANCELLED'
                    )
                 )) FROM document_items di2 
                    LEFT JOIN articles a ON a.id = di2.article_id
                    WHERE di2.document_id = $1 AND di2.invoice = di.invoice
                ) AS items`;

        const baseInvoiceFrom = `
            FROM document_items di
            LEFT JOIN invoice_conciliations ic
                ON ic.document_id = $1 AND ic.invoice_number = di.invoice
            LEFT JOIN users u ON u.id = ic.conciliado_por
            LEFT JOIN document_l_payments p
                ON TRIM(UPPER(p.invoice)) = TRIM(UPPER(di.invoice))
            LEFT JOIN route_invoices ri2
                ON (TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = TRIM(ri2.invoice_id)
                    OR CONCAT(di.document_id::text, '_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))) = ri2.invoice_id)
            LEFT JOIN routes r2 ON r2.id::text = ri2.route_id::text
            LEFT JOIN vehicles v2 ON v2.id::text = r2.vehicle_id::text
            WHERE di.document_id = $1
              AND di.invoice IS NOT NULL
              AND di.invoice <> ''
            GROUP BY di.invoice, di.customer_name, di.city, di.address,
                     ic.id, ic.banco, ic.valor, ic.comprobante, ic.fecha_pago,
                     ic.forma_pago, ic.numero_cheque, ic.es_devolucion, ic.conciliado_por,
                     ic.conductor_id, ic.conductor_name, ic.vehicle_plate, ic.created_at, u.name
            ORDER BY di.invoice`;

        // Intentar con columnas MasterSuite; si no existen, reintentar sin ellas
        let invoicesRes: any;
        try {
            invoicesRes = await pool.query(
                baseInvoiceSelect + `,
                MAX(di.mastersuite_estado)              AS mastersuite_estado,
                MAX(di.mastersuite_id_carga)            AS mastersuite_id_carga,
                MAX(di.mastersuite_fecha_despacho::text) AS mastersuite_fecha_despacho,
                MAX(di.mastersuite_fecha_entrega::text)  AS mastersuite_fecha_entrega,
                MAX(di.mastersuite_motivo_dev)           AS mastersuite_motivo_dev`
                + baseInvoiceFrom,
                [documentId]
            );
        } catch (e: any) {
            if (e.message?.includes('does not exist')) {
                // Migración pendiente en este entorno — consultar sin campos MasterSuite
                invoicesRes = await pool.query(
                    baseInvoiceSelect + `,
                    NULL::text AS mastersuite_estado,
                    NULL::text AS mastersuite_id_carga,
                    NULL::text AS mastersuite_fecha_despacho,
                    NULL::text AS mastersuite_fecha_entrega,
                    NULL::text AS mastersuite_motivo_dev`
                    + baseInvoiceFrom,
                    [documentId]
                );
            } else {
                throw e;
            }
        }

        // ── Rutas/placas que cargaron facturas de este documento ─────────────
        // CTE para evitar multiplicación de filas: primero agrega a nivel de
        // factura única, luego se cruza con rutas.
        const routesRes = await pool.query(`
            WITH inv_base AS (
                -- Una fila por factura única del documento
                SELECT
                    TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))  AS inv_key,
                    MAX(di.item_status)                                     AS item_status,
                    -- Conciliación (a lo sumo una fila por factura por doc)
                    MAX(ic.forma_pago)                                      AS forma_pago,
                    MAX(ic.es_devolucion::int)::boolean                     AS es_devolucion,
                    COALESCE(MAX(ic.valor::numeric), 0)                     AS valor_conc,
                    COALESCE(MAX(ic.sobrecosto::numeric), 0)                AS sobrecosto,
                    -- Pago original (tomar el MAYOR vmetodo por factura para evitar doble conteo)
                    COALESCE(MAX(p.vmetodo::numeric), 0)                    AS invoice_value,
                    MAX(p.metodo_pago)                                      AS metodo_pago
                FROM document_items di
                LEFT JOIN invoice_conciliations ic
                    ON ic.document_id = $1
                    AND TRIM(UPPER(ic.invoice_number)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
                LEFT JOIN LATERAL (
                    SELECT vmetodo, metodo_pago
                    FROM document_l_payments
                    WHERE TRIM(UPPER(invoice)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
                    ORDER BY id DESC LIMIT 1
                ) p ON true
                WHERE di.document_id = $1
                  AND di.invoice IS NOT NULL AND di.invoice <> ''
                GROUP BY TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))
            ),
            route_inv AS (
                -- Relacionar cada factura con su ruta (DISTINCT para ignorar reasignaciones)
                SELECT DISTINCT ON (ib.inv_key)
                    ib.*,
                    r.id::text  AS route_id,
                    COALESCE(v.plate, r.vehicle_id::text) AS plate,
                    d.name      AS driver_name
                FROM inv_base ib
                JOIN route_invoices ri
                    ON ri.invoice_id = ib.inv_key
                    OR ri.invoice_id = CONCAT($1::text, '_', ib.inv_key)
                JOIN routes  r ON r.id::text = ri.route_id::text
                LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
                LEFT JOIN drivers  d ON d.id::text = r.driver_id::text
                ORDER BY ib.inv_key, ri.id DESC
            )
            SELECT
                route_id,
                plate,
                driver_name,
                COUNT(*)                                                              AS invoice_count,
                -- Efectivo / Crédito originales
                COALESCE(SUM(CASE WHEN UPPER(TRIM(metodo_pago)) LIKE '%EFECTIVO%' OR UPPER(TRIM(metodo_pago)) LIKE '%EFE%'
                    THEN invoice_value ELSE 0 END), 0)                               AS efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago IS NOT NULL
                    AND UPPER(TRIM(metodo_pago)) NOT LIKE '%EFECTIVO%'
                    AND UPPER(TRIM(metodo_pago)) NOT LIKE '%EFE%'
                    THEN invoice_value ELSE 0 END), 0)                               AS credito,
                -- Conteos por estado
                COUNT(*) FILTER (WHERE item_status IN ('EST-12','ENTREGADO','COMPLETED','FINALIZADO')) AS completadas,
                COUNT(*) FILTER (WHERE es_devolucion = true OR item_status IN ('EST-13','DEVUELTO'))   AS devueltas,
                COUNT(*) FILTER (WHERE item_status IN ('EST-14','ENTREGA PARCIAL'))                    AS parciales,
                COUNT(*) FILTER (WHERE forma_pago IS NOT NULL)                                         AS legalizadas,
                -- Valores financieros correctos (sin multiplicación)
                COALESCE(SUM(CASE WHEN forma_pago IS NOT NULL THEN valor_conc ELSE 0 END), 0)          AS valor_legalizado,
                COALESCE(SUM(CASE WHEN es_devolucion = true THEN invoice_value ELSE 0 END), 0)         AS valor_devuelto,
                COALESCE(SUM(CASE WHEN item_status IN ('EST-14','ENTREGA PARCIAL') THEN valor_conc ELSE 0 END), 0) AS valor_parcial,
                COALESCE(SUM(sobrecosto), 0)                                                           AS total_sobrecosto
            FROM route_inv
            GROUP BY route_id, plate, driver_name
            ORDER BY invoice_count DESC
        `, [documentId]);

        // ── Facturas sin asignar a ruta ───────────────────────────────────────
        const unassignedRes = await pool.query(`
            SELECT COUNT(DISTINCT di.invoice) AS unassigned
            FROM document_items di
            WHERE di.document_id = $1
              AND di.invoice IS NOT NULL AND di.invoice <> ''
              AND NOT EXISTS (
                SELECT 1 FROM route_invoices ri
                WHERE ri.invoice_id = TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number))
                   OR ri.invoice_id = CONCAT(di.document_id,'_', TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)))
              )
        `, [documentId]);

        // ── Extras: Sobrecostos y Consignaciones Grupales ────────────────────
        const surchargesRes = await pool.query(
            `SELECT * FROM route_surcharges WHERE document_id = $1 ORDER BY created_at ASC`,
            [documentId]
        );
        const paymentsRes = await pool.query(
            `SELECT * FROM route_group_payments WHERE document_id = $1 ORDER BY created_at ASC`,
            [documentId]
        );

        res.json({
            success: true,
            doc,
            invoices: invoicesRes.rows,
            routes:   routesRes.rows,
            unassigned_invoices: Number(unassignedRes.rows[0]?.unassigned || 0),
            routeSurcharges: surchargesRes.rows,
            groupPayments: paymentsRes.rows
        });
    } catch (err: any) {
        console.error('[CONCILIATION] getConciliationByDocument error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /conciliation/save ──────────────────────────────────────────────────
// Guarda o actualiza la conciliación de UNA factura dentro de un documento.
// También actualiza item_status en document_items y guarda historial.
export const saveConciliation = async (req: Request, res: Response) => {
    const {
        documentId, invoiceNumber,
        banco, valor, comprobante, fechaPago, formaPago, numeroCheque,
        esDevolucion, conciliadoPor,
        vehiclePlate, conductorId, conductorName,
        estadoEntrega,   // 'entregado' | 'parcial' | 'devolucion'
        valorFactura,    // valor original de la factura (para calcular devuelto en parcial)
        usuarioNombre,
        sobrecosto,
        itemsReturned,
    } = req.body;

    if (!documentId || !invoiceNumber) {
        return res.status(400).json({ success: false, error: 'documentId e invoiceNumber son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Estado anterior de la factura
        const prevRes = await client.query(
            `SELECT ic.forma_pago, di.item_status
             FROM document_items di
             LEFT JOIN invoice_conciliations ic ON ic.document_id = $1 AND ic.invoice_number = $2
             WHERE di.document_id = $1 AND di.invoice = $2 LIMIT 1`,
            [documentId, invoiceNumber]
        );
        const prevFormaPago  = prevRes.rows[0]?.forma_pago  || null;
        const prevItemStatus = prevRes.rows[0]?.item_status || null;

        // 2. UPSERT en invoice_conciliations
        const result = await client.query(`
            INSERT INTO invoice_conciliations
                (document_id, invoice_number, banco, valor, comprobante, fecha_pago,
                 forma_pago, numero_cheque, es_devolucion, conciliado_por,
                 vehicle_plate, conductor_id, conductor_name, sobrecosto, items_returned, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
            ON CONFLICT (document_id, invoice_number) DO UPDATE SET
                banco           = EXCLUDED.banco,
                valor           = EXCLUDED.valor,
                comprobante     = EXCLUDED.comprobante,
                fecha_pago      = EXCLUDED.fecha_pago,
                forma_pago      = EXCLUDED.forma_pago,
                numero_cheque   = EXCLUDED.numero_cheque,
                es_devolucion   = EXCLUDED.es_devolucion,
                conciliado_por  = EXCLUDED.conciliado_por,
                vehicle_plate   = EXCLUDED.vehicle_plate,
                conductor_id    = EXCLUDED.conductor_id,
                conductor_name  = EXCLUDED.conductor_name,
                sobrecosto      = EXCLUDED.sobrecosto,
                items_returned  = EXCLUDED.items_returned,
                updated_at      = NOW()
            RETURNING *
        `, [
            documentId, invoiceNumber,
            banco || null, valor || null, comprobante || null, fechaPago || null,
            formaPago || null, numeroCheque || null, esDevolucion ?? false, conciliadoPor || null,
            vehiclePlate || null, conductorId || null, conductorName || null,
            Number(sobrecosto) || 0,
            itemsReturned ? JSON.stringify(itemsReturned) : '[]',
        ]);

        // 3. Determinar nuevo item_status según estado de entrega
        let nuevoItemStatus: string | null = null;
        let eventoHistorial = 'LEGALIZADO';

        if (esDevolucion || estadoEntrega === 'devolucion' || formaPago === 'DEVOLUCION') {
            nuevoItemStatus = 'EST-13';
            eventoHistorial = 'DEVOLUCION';
        } else if (estadoEntrega === 'parcial') {
            nuevoItemStatus = 'EST-14';
            eventoHistorial = 'PARCIAL';
        } else if (estadoEntrega === 'entregado' || formaPago) {
            nuevoItemStatus = 'EST-12';
            eventoHistorial = 'LEGALIZADO';
        }

        // 4. Actualizar item_status en document_items (si hay cambio)
        if (nuevoItemStatus) {
            await client.query(
                `UPDATE document_items SET item_status = $1
                 WHERE document_id = $2 AND invoice = $3`,
                [nuevoItemStatus, documentId, invoiceNumber]
            );
        }

        // 5. COMMIT — la conciliación queda guardada independiente del historial
        await client.query('COMMIT');
        res.json({ success: true, data: result.rows[0] });

        // 6. Historial: best-effort fuera de la transacción (no bloquea si la tabla no existe aún)
        const valorNum   = Number(valor) || 0;
        const facturaNum = Number(valorFactura) || 0;
        const valorEntregado = esDevolucion || estadoEntrega === 'devolucion' ? 0 : valorNum;
        const valorDevuelto  = estadoEntrega === 'parcial' && facturaNum > valorNum
            ? facturaNum - valorNum : 0;

        pool.query(`
            INSERT INTO invoice_status_history
                (document_id, invoice_number, evento, estado_anterior, estado_nuevo,
                 valor_factura, valor_entregado, valor_devuelto,
                 usuario_id, usuario_nombre, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `, [
            documentId, invoiceNumber, eventoHistorial,
            prevItemStatus, nuevoItemStatus,
            facturaNum > 0 ? facturaNum : null,
            valorEntregado > 0 ? valorEntregado : null,
            valorDevuelto  > 0 ? valorDevuelto  : null,
            conciliadoPor  || null,
            usuarioNombre  || null,
        ]).catch(e => console.warn('[CONCILIATION] history insert skipped:', e.message));

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[CONCILIATION] saveConciliation error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// ─── POST /conciliation/import-mastersuite ────────────────────────────────────
// Recibe un Excel (MasterSuite), extrae placa/ID carga/factura/estado/fecha y
// actualiza document_items.mastersuite_* para cada fila.
export const importMasterSuite = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió archivo' });
        }

        const fileBuffer = readFileSync(req.file.path);
        const wb = XLSX.read(fileBuffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Fila 7 (índice 6) es el encabezado, datos desde fila 8 (índice 7)
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 6, defval: '' });

        // Columnas: 0=Placa, 1=Conductor, 2=RazonSocial, 3=IDCarga, 4=Documento(Factura),
        //           5=Estado, 6=Distancia, 7=FechaDespacho, 8=FechaHoraEntrega, 11=MotivoDevolucion
        const dataRows = rows.slice(1); // saltar encabezado

        let updated = 0;
        let notFound = 0;
        const errors: string[] = [];

        for (const row of dataRows) {
            const placa         = String(row[0] || '').trim();
            const idCarga       = String(row[3] || '').trim();
            const factura       = String(row[4] || '').trim();
            const estado        = String(row[5] || '').trim();
            const fechaDespacho = String(row[7] || '').trim();
            const fechaEntrega  = String(row[8] || '').trim();
            const motivoDev     = String(row[11] || '').trim();

            if (!factura) continue;

            // Parsear fechas al formato ISO
            const parseFecha = (s: string): string | null => {
                if (!s) return null;
                // "08/04/2026" → ISO date; "09/04/2026 14:34:36" → ISO timestamp
                const parts = s.split(' ');
                const dateParts = parts[0].split('/');
                if (dateParts.length !== 3) return null;
                return `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}${parts[1] ? ' ' + parts[1] : ''}`;
            };

            try {
                const upd = await pool.query(
                    `UPDATE document_items
                     SET mastersuite_estado         = $1,
                         mastersuite_id_carga       = $2,
                         mastersuite_fecha_despacho = $3,
                         mastersuite_fecha_entrega  = $4,
                         mastersuite_motivo_dev     = $5
                     WHERE TRIM(UPPER(invoice)) = TRIM(UPPER($6))`,
                    [
                        estado   || null,
                        idCarga  || null,
                        parseFecha(fechaDespacho),
                        parseFecha(fechaEntrega),
                        motivoDev || null,
                        factura,
                    ]
                );
                if ((upd.rowCount ?? 0) > 0) {
                    updated++;
                } else {
                    notFound++;
                }
            } catch (e: any) {
                errors.push(`${factura}: ${e.message}`);
            }
        }

        // Cleanup temp file
        unlink(req.file.path, () => {});

        res.json({ success: true, updated, notFound, total: dataRows.length, errors: errors.slice(0, 10) });
    } catch (err: any) {
        console.error('[CONCILIATION] importMasterSuite error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /conciliation/:documentId/history ────────────────────────────────────
// Historial de estados de todas las facturas de un documento
export const getInvoiceStatusHistory = async (req: Request, res: Response) => {
    const { documentId } = req.params;
    try {
        const result = await pool.query(`
            SELECT * FROM invoice_status_history
            WHERE document_id = $1
            ORDER BY created_at DESC
        `, [documentId]);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /conciliation/history ───────────────────────────────────────────────
// Facturas ya conciliadas con filtros opcionales (fecha_desde, fecha_hasta,
// documento, factura, placa). Devuelve filas planas para la tabla de historial.
export const getConciliationHistory = async (req: Request, res: Response) => {
    try {
        const { from, to, doc_id, invoice, plate } = req.query;
        const params: any[] = [];
        let p = 1;
        const conds: string[] = ['ic.forma_pago IS NOT NULL'];

        if (from)    { conds.push(`ic.created_at >= $${p++}`); params.push(from); }
        if (to)      { conds.push(`ic.created_at <= $${p++}::timestamp + interval '1 day'`); params.push(to); }
        if (doc_id)  { conds.push(`dl.external_doc_id ILIKE $${p++}`); params.push(`%${doc_id}%`); }
        if (invoice) { conds.push(`ic.invoice_number ILIKE $${p++}`); params.push(`%${invoice}%`); }
        if (plate)   { conds.push(`ic.vehicle_plate ILIKE $${p++}`); params.push(`%${plate}%`); }

        const where = conds.join(' AND ');

        const result = await pool.query(`
            SELECT
                ic.id,
                ic.invoice_number,
                ic.document_id,
                dl.external_doc_id,
                ic.vehicle_plate,
                ic.conductor_name,
                ic.forma_pago,
                ic.valor,
                ic.banco,
                ic.comprobante,
                ic.numero_cheque,
                ic.fecha_pago,
                ic.es_devolucion,
                ic.created_at          AS conciliado_at,
                u.name                 AS conciliado_por_nombre,
                di.customer_name,
                di.city
            FROM invoice_conciliations ic
            JOIN documents_l dl ON dl.id = ic.document_id
            LEFT JOIN users u ON u.id = ic.conciliado_por
            LEFT JOIN (
                SELECT DISTINCT ON (document_id, invoice) document_id, invoice, customer_name, city
                FROM document_items WHERE invoice IS NOT NULL
            ) di ON di.document_id = ic.document_id AND di.invoice = ic.invoice_number
            WHERE ${where}
            ORDER BY ic.created_at DESC
            LIMIT 500
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[CONCILIATION] getConciliationHistory error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── GET /conciliation/planilla ───────────────────────────────────────────────
// Recibe routeId (routes.id), consulta route_invoices y genera Excel de 1 hoja.
export const downloadPlanilla = async (req: Request, res: Response) => {
    try {
        const { routeId } = req.query;
        if (!routeId) {
            return res.status(400).json({ success: false, error: 'routeId es requerido' });
        }

        // ── 1. Cabecera de la ruta ────────────────────────────────────────────
        const routeRes = await pool.query(`
            SELECT
                r.id,
                r.created_at::date          AS fecha,
                r.vehicle_capacity_m3,
                v.plate                     AS placa,
                v.capacity_m3,
                d.name                      AS conductor,
                e.name                      AS estado,
                c.name                      AS cliente
            FROM routes r
            LEFT JOIN vehicles v ON v.id::text = r.vehicle_id::text
            LEFT JOIN drivers  d ON d.id::text = r.driver_id::text
            LEFT JOIN estados  e ON e.id       = r.status_id
            LEFT JOIN clients  c ON c.id       = r.client_id
            WHERE r.id::text = $1::text
        `, [routeId]);

        if (!routeRes.rows.length) {
            return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
        }
        const ruta = routeRes.rows[0];

        // ── 2. Facturas via route_invoices ────────────────────────────────────
        const invRes = await pool.query(`
            SELECT
                dl.external_doc_id                                                AS "Documento",
                COALESCE(NULLIF(di.invoice,''), di.order_number)                  AS "Factura",
                di.customer_name                                                   AS "Cliente",
                di.city                                                            AS "Ciudad",
                di.address                                                         AS "Dirección",
                SUM(COALESCE(di.expected_qty, 0))                                 AS "Cant. Art.",
                MAX(p.vmetodo)                                                     AS "Valor Factura",
                est_item.name                                                      AS "Estado Entrega",
                ic.forma_pago                                                      AS "Forma de Pago",
                ic.banco                                                           AS "Banco",
                ic.valor                                                           AS "Valor Recaudado",
                ic.comprobante                                                     AS "Comprobante",
                ic.fecha_pago                                                      AS "Fecha Pago",
                ic.numero_cheque                                                   AS "No. Cheque",
                CASE WHEN ic.es_devolucion THEN 'SÍ' ELSE 'NO' END               AS "Devolución",
                CASE WHEN ic.forma_pago IS NOT NULL THEN 'CONCILIADA'
                     ELSE 'PENDIENTE' END                                          AS "Estado Conciliación"
            FROM route_invoices ri
            JOIN document_items di
              ON TRIM(COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
              OR CONCAT(di.document_id::text, '_', COALESCE(NULLIF(di.invoice,''), di.order_number)) = ri.invoice_id
            LEFT JOIN documents_l dl
              ON dl.id::text = di.document_id::text
            LEFT JOIN document_l_payments p
              ON TRIM(UPPER(p.invoice)) = TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number)))
            LEFT JOIN invoice_conciliations ic
              ON ic.document_id::text  = di.document_id::text
             AND ic.invoice_number     = COALESCE(NULLIF(di.invoice,''), di.order_number)
            LEFT JOIN estados est_item
              ON est_item.id = di.item_status
            WHERE ri.route_id::text = $1::text
            GROUP BY dl.external_doc_id,
                     COALESCE(NULLIF(di.invoice,''), di.order_number),
                     di.customer_name, di.city, di.address,
                     est_item.name,
                     ic.forma_pago, ic.banco, ic.valor, ic.comprobante,
                     ic.fecha_pago, ic.numero_cheque, ic.es_devolucion
            ORDER BY dl.external_doc_id, "Factura"
        `, [routeId]);

        if (!invRes.rows.length) {
            return res.status(404).json({ success: false, error: 'No se encontraron facturas para esta ruta' });
        }

        const rows = invRes.rows;
        const conciliadas  = rows.filter(r => r['Forma de Pago']).length;
        const pendientes   = rows.length - conciliadas;
        const totalRecaud  = rows.reduce((s, r) => s + (Number(r['Valor Recaudado']) || 0), 0);
        const devoluciones = rows.filter(r => r['Devolución'] === 'SÍ').length;

        // ── 3. Construir Excel — UNA sola hoja ───────────────────────────────
        // XLSX ya está importado al inicio del archivo

        // Cabecera con info de la ruta (array de arrays para control total)
        const header: any[][] = [
            ['PLANILLA DE RUTA'],
            [],
            ['Placa:',      ruta.placa     || '—', '', 'Conductor:',  ruta.conductor || '—'],
            ['Cliente:',    ruta.cliente   || '—', '', 'Estado:',     ruta.estado    || '—'],
            ['Fecha:',      ruta.fecha ? new Date(ruta.fecha).toLocaleDateString('es-CO') : '—',
             '',            'Capacidad m³:', ruta.capacity_m3 || ruta.vehicle_capacity_m3 || '—'],
            [],
            ['Total Facturas:', rows.length, '', 'Conciliadas:',  conciliadas],
            ['Pendientes:',     pendientes,  '', 'Devoluciones:', devoluciones],
            ['Total Recaudado:', totalRecaud],
            [],
            // Encabezados de columna
            ['Documento','Factura','Cliente','Ciudad','Dirección',
             'Cant. Art.','Valor Factura','Estado Entrega',
             'Forma de Pago','Banco','Valor Recaudado','Comprobante',
             'Fecha Pago','No. Cheque','Devolución','Estado Conciliación'],
        ];

        // Filas de datos
        const dataRows = rows.map(r => [
            r['Documento'],
            r['Factura'],
            r['Cliente'],
            r['Ciudad'],
            r['Dirección'],
            r['Cant. Art.'],
            r['Valor Factura'],
            r['Estado Entrega'],
            r['Forma de Pago'],
            r['Banco'],
            r['Valor Recaudado'],
            r['Comprobante'],
            r['Fecha Pago'],
            r['No. Cheque'],
            r['Devolución'],
            r['Estado Conciliación'],
        ]);

        const ws = XLSX.utils.aoa_to_sheet([...header, ...dataRows]);

        // Anchos de columna
        ws['!cols'] = [18,14,28,14,30,10,14,16,16,14,16,16,12,12,10,18].map(w => ({ wch: w }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Planilla');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const plateClean = (ruta.placa || 'SV').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const fechaLabel = ruta.fecha ? String(ruta.fecha).slice(0, 10) : 'fecha';
        const filename   = `Planilla_${plateClean}_${fechaLabel}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buf);
    } catch (err: any) {
        console.error('[CONCILIATION] downloadPlanilla error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const saveSobrecostos = async (req: Request, res: Response) => {
    const { documentId, plate, items, userId } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Asegurar que la tabla existe para evitar errores de esquema inicial
        await client.query(`
            CREATE TABLE IF NOT EXISTS route_surcharges (
                id SERIAL PRIMARY KEY,
                document_id TEXT NOT NULL,
                plate TEXT NOT NULL,
                valor NUMERIC NOT NULL,
                referencia TEXT,
                fecha DATE,
                status_id TEXT DEFAULT 'EST-01',
                user_id TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Procesar cada item de sobrecosto (Insertar o Actualizar si tiene ID)
        for (const item of items) {
            // Un ID de base de datos es un número secuencial. 
            // Un ID temporal del frontend (Date.now()) es un número largo (> 10^10).
            const isDbId = item.id && !isNaN(Number(item.id)) && String(item.id).length < 10;

            if (isDbId) {
                // SOLO actualizar si el estado NO es aprobado (EST-02)
                // Esto cumple con "el que este aprobado no se permita editar"
                await client.query(`
                    UPDATE route_surcharges 
                    SET valor = $1, referencia = $2, fecha = $3, status_id = $4, user_id = $5
                    WHERE id = $6 AND status_id != 'EST-02' AND status_id != 'APROBADO'
                `, [item.valor, item.referencia, item.fecha, item.statusId, userId, item.id]);
            } else {
                // Para evitar duplicidad al dar clic varias veces en "Solicitar"
                // verificamos si ya existe un registro idéntico pendiente para esta placa/documento
                const existing = await client.query(`
                    SELECT id FROM route_surcharges 
                    WHERE document_id = $1 AND plate = $2 AND valor = $3 AND referencia = $4 AND status_id = $5
                    LIMIT 1
                `, [documentId, plate, item.valor, item.referencia, item.statusId || 'EST-01']);

                if (existing.rows.length === 0) {
                    await client.query(`
                        INSERT INTO route_surcharges (document_id, plate, valor, referencia, fecha, status_id, user_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [documentId, plate, item.valor, item.referencia, item.fecha, item.statusId || 'EST-01', userId]);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        if (client) await client.query('ROLLBACK');
        console.error('[CONCILIATION] saveSobrecostos error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// ─── POST /conciliation/group-payments ─────────────────────────────────────────
export const saveRouteGroupPayments = async (req: Request, res: Response) => {
    const { documentId, plate, payments, userId } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const pay of payments) {
            const valNum = Math.floor(Number(String(pay.valor).replace(/\D/g, '')) || 0);
            
            if (pay.id && !String(pay.id).includes('-')) {
                // Es un registro existente (ID numérico de DB) -> UPDATE
                await client.query(`
                    UPDATE route_group_payments
                    SET valor = $1, referencia = $2, fecha = $3, metodo_pago = $4, observacion = $5, user_id = $6
                    WHERE id = $7 AND document_id = $8
                `, [valNum, pay.referencia, pay.fecha, pay.metodo, pay.observacion, userId, pay.id, documentId]);
            } else {
                // Es un registro nuevo -> INSERT
                await client.query(`
                    INSERT INTO route_group_payments (document_id, plate, valor, referencia, fecha, metodo_pago, observacion, user_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [documentId, plate, valNum, pay.referencia, pay.fecha, pay.metodo, pay.observacion, userId]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        if (client) await client.query('ROLLBACK');
        console.error('[CONCILIATION] saveRouteGroupPayments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

// ─── POST /conciliation/report ────────────────────────────────────────────────
// Genera el Excel multi-hoja y lo envía por correo.
export const generateAndSendReport = async (req: Request, res: Response) => {
    const { documentId, targetEmail } = req.body;

    if (!documentId || !targetEmail) {
        return res.status(400).json({ success: false, error: 'documentId y targetEmail son requeridos' });
    }

    try {
        // 1. Datos del documento
        const docRes = await pool.query(`
            SELECT dl.*, c.name AS client_name
            FROM documents_l dl
            LEFT JOIN clients c ON c.id = dl.client_id
            WHERE dl.id = $1
        `, [documentId]);

        if (!docRes.rows.length) {
            return res.status(404).json({ success: false, error: 'Documento no encontrado' });
        }

        const doc = docRes.rows[0];

        // 2. Facturas con conciliación
        const invRes = await pool.query(`
            SELECT
                di.invoice          AS "Factura",
                di.customer_name    AS "Cliente / Destinatario",
                di.city             AS "Ciudad",
                di.address          AS "Dirección",
                SUM(COALESCE(di.expected_qty, 0)) AS "Cantidad",
                ic.forma_pago       AS "Forma de Pago",
                ic.banco            AS "Banco",
                ic.valor            AS "Valor Recaudado",
                ic.comprobante      AS "No. Comprobante",
                ic.fecha_pago       AS "Fecha de Pago",
                ic.numero_cheque    AS "No. Cheque",
                CASE WHEN ic.es_devolucion THEN 'SÍ' ELSE 'NO' END AS "Es Devolución",
                ic.conductor_name   AS "Conductor",
                ic.vehicle_plate    AS "Placa",
                ic.created_at       AS "Fecha Conciliación",
                u.name              AS "Conciliado Por"
            FROM document_items di
            LEFT JOIN invoice_conciliations ic ON ic.document_id = $1 AND ic.invoice_number = di.invoice
            LEFT JOIN users u ON u.id = ic.conciliado_por
            WHERE di.document_id = $1 AND di.invoice IS NOT NULL AND di.invoice <> ''
            GROUP BY di.invoice, di.customer_name, di.city, di.address,
                     ic.forma_pago, ic.banco, ic.valor, ic.comprobante, ic.fecha_pago,
                     ic.numero_cheque, ic.es_devolucion, ic.conductor_name, ic.vehicle_plate,
                     ic.created_at, u.name
            ORDER BY di.invoice
        `, [documentId]);

        const invoiceRows = invRes.rows;

        // 3. Resumen por forma de pago
        const resumenMap: Record<string, number> = {};
        let totalRecaudado = 0;
        let totalDevoluciones = 0;

        for (const row of invoiceRows) {
            const fp = row['Forma de Pago'] || 'SIN REGISTRAR';
            const val = Number(row['Valor Recaudado']) || 0;
            resumenMap[fp] = (resumenMap[fp] || 0) + val;
            totalRecaudado += val;
            if (row['Es Devolución'] === 'SÍ') totalDevoluciones++;
        }

        const resumenRows = Object.entries(resumenMap).map(([fp, total]) => ({
            'Forma de Pago': fp,
            'Total Recaudado': total,
            'Facturas': invoiceRows.filter(r => (r['Forma de Pago'] || 'SIN REGISTRAR') === fp).length,
        }));

        // 4. Hoja consolidada (portada) — misma info que la imagen de referencia
        const portadaRows = [{
            'Documento':        doc.external_doc_id || doc.id,
            'Placa':            doc.vehicle_plate || '—',
            'Plan':             doc.plan_type || 'PLAN R',
            'Fecha':            doc.delivery_date ? new Date(doc.delivery_date).toLocaleDateString('es-CO') : '—',
            'Total Facturas':   invoiceRows.length,
            'Conciliadas':      invoiceRows.filter(r => r['Forma de Pago']).length,
            'Pendientes':       invoiceRows.filter(r => !r['Forma de Pago']).length,
            'Devoluciones':     totalDevoluciones,
            'Total Recaudado':  totalRecaudado,
            'Estado':           invoiceRows.every(r => r['Forma de Pago']) ? 'COMPLETO' : 'INCOMPLETO',
        }];

        // 5. Construir Excel multi-hoja
        // XLSX ya está importado al inicio del archivo

        const wb = XLSX.utils.book_new();

        const wsPortada   = XLSX.utils.json_to_sheet(portadaRows);
        const wsFacturas  = XLSX.utils.json_to_sheet(invoiceRows);
        const wsResumen   = XLSX.utils.json_to_sheet(resumenRows);

        XLSX.utils.book_append_sheet(wb, wsPortada,  'Resumen General');
        XLSX.utils.book_append_sheet(wb, wsFacturas, 'Detalle Facturas');
        XLSX.utils.book_append_sheet(wb, wsResumen,  'Resumen por Pago');

        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const docLabel = doc.external_doc_id || doc.id;
        const plate    = doc.vehicle_plate || 'SV';

        // 6. Enviar por correo
        const { sendEmail } = await import('../services/notification.service.js');

        const subject = `📊 CONCILIACIÓN PLAN R — ${docLabel} [${plate}]`;

        const html = `
        <!DOCTYPE html><html><head>
        <style>
          body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc;margin:0;padding:0;}
          .wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;}
          .hdr{background:#0f172a;padding:28px;text-align:center;}
          .hdr h1{color:#fff;font-size:22px;font-weight:900;margin:0;letter-spacing:-0.5px;}
          .hdr p{color:#94a3b8;font-size:12px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px;}
          .body{padding:24px;}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
          .card{background:#f1f5f9;border-radius:8px;padding:14px;}
          .card-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}
          .card-val{font-size:18px;font-weight:900;color:#0f172a;}
          .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;}
          .badge-green{background:#dcfce7;color:#166534;}
          .badge-amber{background:#fef3c7;color:#92400e;}
          .footer{padding:16px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;}
        </style></head><body>
        <div class="wrap">
          <div class="hdr">
            <h1>CONCILIACIÓN DE PLAN R</h1>
            <p>Planilla de control de entregas y recaudos</p>
          </div>
          <div class="body">
            <div class="grid">
              <div class="card"><div class="card-label">Documento</div><div class="card-val">${docLabel}</div></div>
              <div class="card"><div class="card-label">Placa</div><div class="card-val">${plate}</div></div>
              <div class="card"><div class="card-label">Total Facturas</div><div class="card-val">${invoiceRows.length}</div></div>
              <div class="card"><div class="card-label">Total Recaudado</div><div class="card-val">$${totalRecaudado.toLocaleString('es-CO')}</div></div>
            </div>
            <p style="font-size:13px;color:#334155;">
              Se adjunta el Excel con el detalle completo de la conciliación en 3 pestañas:
              <strong>Resumen General</strong>, <strong>Detalle Facturas</strong> y <strong>Resumen por Forma de Pago</strong>.
            </p>
            <p>Estado: <span class="badge ${invoiceRows.every(r => r['Forma de Pago']) ? 'badge-green' : 'badge-amber'}">
              ${invoiceRows.every(r => r['Forma de Pago']) ? 'CONCILIACIÓN COMPLETA' : 'PENDIENTE'}
            </span></p>
          </div>
          <div class="footer">Generado por ORBIT M7 · ${new Date().toLocaleString('es-CO')}</div>
        </div>
        </body></html>`;

        const attachments = [{
            filename: `Conciliacion_${docLabel}_${plate}.xlsx`,
            content: excelBuffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }];

        const emails = Array.isArray(targetEmail) ? targetEmail : [targetEmail];
        for (const email of emails) {
            try { await sendEmail(email, subject, html, attachments); } catch (e: any) {
                console.error(`[CONCILIATION] sendEmail error to ${email}:`, e.message);
            }
        }

        res.json({ success: true, invoicesCount: invoiceRows.length, totalRecaudado });
    } catch (err: any) {
        console.error('[CONCILIATION] generateAndSendReport error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
