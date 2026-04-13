
import { Request, Response } from 'express';
import pool from '../config/database.js';
// @ts-ignore – xlsx está instalado en el servidor; no hay node_modules local
import * as XLSX from 'xlsx';

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

                -- Conteo de facturas en el documento
                COUNT(DISTINCT di.invoice)                                   AS total_invoices,
                COUNT(DISTINCT ic.invoice_number)                            AS conciliadas,
                COUNT(DISTINCT di.invoice) - COUNT(DISTINCT ic.invoice_number) AS pendientes,

                -- Conductor y placa desde dispatch (última asignación del doc)
                (SELECT da.driver_id FROM dispatch_assignments da
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_id,
                (SELECT u.name FROM dispatch_assignments da
                 LEFT JOIN users u ON u.id = da.driver_id
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_name

            FROM documents_l dl
            LEFT JOIN document_items di ON di.document_id = dl.id AND di.invoice IS NOT NULL AND di.invoice <> ''
            LEFT JOIN invoice_conciliations ic ON ic.document_id = dl.id AND ic.invoice_number = di.invoice

            ${where}
            GROUP BY dl.id
            HAVING COUNT(DISTINCT di.invoice) > 0
              AND COUNT(DISTINCT di.invoice) - COUNT(DISTINCT ic.invoice_number) > 0
            ORDER BY dl.created_at DESC
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        console.error('[CONCILIATION] getPendingConciliations error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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
                 WHERE ri2.route_id = r.id
                ) AS conciliadas
            FROM routes r
            LEFT JOIN vehicles       v  ON v.id::text  = r.vehicle_id::text
            LEFT JOIN drivers        d  ON d.id::text  = r.driver_id::text
            LEFT JOIN estados        e  ON e.id        = r.status_id
            LEFT JOIN route_invoices ri ON ri.route_id = r.id
            WHERE r.client_id = $1
              AND r.created_at::date = $2::date
            GROUP BY r.id, v.plate, v.capacity_m3, d.name, e.name, r.status_id, r.vehicle_capacity_m3, r.created_at
            ORDER BY r.created_at DESC
        `, [clientId, date]);

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

        // Facturas únicas del documento con sus ítems y datos de pago precargados
        const invoicesRes = await pool.query(`
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
                ic.created_at                               AS conciliado_at,
                u.name                                      AS conciliado_por_nombre,
                -- Valor e información de pago pre-cargada desde document_l_payments
                MAX(p.vmetodo)                              AS invoice_value,
                MAX(p.metodo_pago)                          AS invoice_banco
            FROM document_items di
            LEFT JOIN invoice_conciliations ic
                ON ic.document_id = $1 AND ic.invoice_number = di.invoice
            LEFT JOIN users u ON u.id = ic.conciliado_por
            LEFT JOIN document_l_payments p
                ON TRIM(UPPER(p.invoice)) = TRIM(UPPER(di.invoice))
            WHERE di.document_id = $1
              AND di.invoice IS NOT NULL
              AND di.invoice <> ''
            GROUP BY di.invoice, di.customer_name, di.city, di.address,
                     ic.id, ic.banco, ic.valor, ic.comprobante, ic.fecha_pago,
                     ic.forma_pago, ic.numero_cheque, ic.es_devolucion, ic.conciliado_por,
                     ic.conductor_id, ic.conductor_name, ic.vehicle_plate, ic.created_at, u.name
            ORDER BY di.invoice
        `, [documentId]);

        res.json({ success: true, doc, invoices: invoicesRes.rows });
    } catch (err: any) {
        console.error('[CONCILIATION] getConciliationByDocument error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─── POST /conciliation/save ──────────────────────────────────────────────────
// Guarda o actualiza la conciliación de UNA factura dentro de un documento.
export const saveConciliation = async (req: Request, res: Response) => {
    const {
        documentId, invoiceNumber,
        banco, valor, comprobante, fechaPago, formaPago, numeroCheque,
        esDevolucion, conciliadoPor,
        vehiclePlate, conductorId, conductorName,
    } = req.body;

    if (!documentId || !invoiceNumber) {
        return res.status(400).json({ success: false, error: 'documentId e invoiceNumber son requeridos' });
    }

    try {
        // UPSERT: si ya existe para ese doc + factura, actualiza; si no, inserta
        const result = await pool.query(`
            INSERT INTO invoice_conciliations
                (document_id, invoice_number, banco, valor, comprobante, fecha_pago,
                 forma_pago, numero_cheque, es_devolucion, conciliado_por,
                 vehicle_plate, conductor_id, conductor_name, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
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
                updated_at      = NOW()
            RETURNING *
        `, [
            documentId, invoiceNumber,
            banco || null, valor || null, comprobante || null, fechaPago || null,
            formaPago || null, numeroCheque || null, esDevolucion ?? false, conciliadoPor || null,
            vehiclePlate || null, conductorId || null, conductorName || null,
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        console.error('[CONCILIATION] saveConciliation error:', err.message);
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
        if (to)      { conds.push(`ic.created_at <= $${p++} + interval '1 day'`); params.push(to); }
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
            WHERE r.id = $1
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
                TO_CHAR(ic.fecha_pago, 'DD/MM/YYYY')                              AS "Fecha Pago",
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
            WHERE ri.route_id = $1
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
