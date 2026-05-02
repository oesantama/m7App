
import { Request, Response } from 'express';
import pool from '../config/database.js';
import { logMovement } from '../utils/kardex.js';

// ─── INVENTARIO DE VEHÍCULO ───────────────────────────────────────────────────

/**
 * GET /api/inventory/vehicle?plate=&driverId=
 * Devuelve el stock actual de un vehículo/conductor
 */
export const getVehicleInventory = async (req: Request, res: Response) => {
  const { plate, driverId } = req.query as Record<string, string>;
  try {
    const conditions: string[] = ['vi.quantity > 0'];
    const params: any[] = [];
    if (plate)    { params.push(plate);    conditions.push(`vi.vehicle_plate = $${params.length}`); }
    if (driverId) { params.push(driverId); conditions.push(`vi.driver_id = $${params.length}`); }

    const result = await pool.query(`
      SELECT vi.*, a.name as article_full_name
      FROM vehicle_inventory vi
      LEFT JOIN articles a ON a.id = vi.article_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY vi.vehicle_plate, vi.article_id
    `, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── HISTÓRICO DE ASIGNACIÓN A RUTA ──────────────────────────────────────────

/**
 * GET /api/inventory/route-assignments?routeId=&plate=&dateFrom=&dateTo=
 */
export const getRouteAssignmentItems = async (req: Request, res: Response) => {
  const { routeId, plate, dateFrom, dateTo } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (routeId)  { params.push(routeId);  conditions.push(`rai.route_id = $${params.length}`); }
    if (plate)    { params.push(plate);    conditions.push(`rai.vehicle_plate = $${params.length}`); }
    if (dateFrom) { params.push(dateFrom); conditions.push(`rai.assigned_at >= $${params.length}`); }
    if (dateTo)   { params.push(dateTo);   conditions.push(`rai.assigned_at <= $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT rai.* FROM route_assignment_items rai ${where} ORDER BY rai.assigned_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── DEVOLUCIONES A PROVEEDOR ─────────────────────────────────────────────────

/**
 * GET /api/inventory/supplier-returns?clientId=&status=
 */
export const getSupplierReturns = async (req: Request, res: Response) => {
  const { clientId, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (clientId) { params.push(clientId); conditions.push(`sr.client_id = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`sr.status = $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT sr.*,
          (SELECT json_agg(i) FROM supplier_return_items i WHERE i.return_id::text = sr.id::text) as items
        FROM supplier_returns sr ${where}
        ORDER BY sr.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}
      `, [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM supplier_returns sr ${where}`, params)
    ]);

    res.json({ success: true, data: dataRes.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/inventory/supplier-returns
 * Registra devolución a proveedor y descuenta de inventario_clientes
 */
export const createSupplierReturn = async (req: Request, res: Response) => {
  const { clientId, vehiclePlate, reference, returnReason, notes, items, createdBy } = req.body;
  if (!clientId || !items?.length) {
    return res.status(400).json({ error: 'clientId e items son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const totalItems = items.length;
    const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);

    const returnRes = await client.query(`
      INSERT INTO supplier_returns (client_id, vehicle_plate, reference, return_reason, total_items, total_qty, status, notes, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'borrador',$7,$8,CURRENT_TIMESTAMP)
      RETURNING id
    `, [clientId, vehiclePlate || null, reference || null, returnReason || null, totalItems, totalQty, notes || null, createdBy]);

    const returnId = returnRes.rows[0].id;

    for (const item of items) {
      await client.query(`
        INSERT INTO supplier_return_items (return_id, article_id, article_name, batch, quantity, unit, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [returnId, item.article_id, item.article_name || item.article_id, item.batch || 'S/L', Number(item.quantity), item.unit || 'und', item.notes || null]);

      // Descontar de inventario_clientes
      await client.query(`
        UPDATE inventario_clientes
        SET quantity = GREATEST(0, quantity::numeric - $1::numeric), last_user = $2, last_updated = CURRENT_TIMESTAMP
        WHERE client_id = $3::text AND article_id = $4::text AND batch = $5::text
      `, [Number(item.quantity), createdBy, clientId, item.article_id, item.batch || 'S/L']);

      // Kardex: SALIDA_PROVEEDOR
      logMovement({
        clientId,
        articleId:     item.article_id,
        articleName:   item.article_name || item.article_id,
        batch:         item.batch || 'S/L',
        movementType:  'SALIDA_PROVEEDOR',
        quantity:      Number(item.quantity),
        locationFrom:  'BODEGA',
        locationTo:    'PROVEEDOR',
        referenceType: 'PROVEEDOR',
        referenceId:   String(returnId),
        vehiclePlate:  vehiclePlate || undefined,
        userId:        createdBy,
        notes:         notes || undefined,
      });
    }

    // Confirmar automáticamente si se pasa confirmed_by
    if (req.body.confirmedBy) {
      await client.query(
        `UPDATE supplier_returns SET status='confirmada', confirmed_by=$1, confirmed_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [req.body.confirmedBy, returnId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, returnId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/inventory/supplier-returns/:id/confirm
 * Confirma una devolución a proveedor (status: borrador → confirmada)
 */
export const confirmSupplierReturn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { confirmedBy } = req.body;
  try {
    await pool.query(
      `UPDATE supplier_returns SET status='confirmada', confirmed_by=$1, confirmed_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [confirmedBy, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── CONCILIACIÓN (CABECERA + TRANSACCIONES) ──────────────────────────────────

/**
 * GET /api/inventory/conciliation-headers?plate=&driverId=&status=&dateFrom=&dateTo=
 */
export const getConciliationHeaders = async (req: Request, res: Response) => {
  const { plate, driverId, status, dateFrom, dateTo, page = '1', limit = '50' } = req.query as Record<string, string>;
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    if (plate)    { params.push(plate);    conditions.push(`ch.vehicle_plate = $${params.length}`); }
    if (driverId) { params.push(driverId); conditions.push(`ch.driver_id = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`ch.status = $${params.length}`); }
    if (dateFrom) { params.push(dateFrom); conditions.push(`ch.conciliation_date >= $${params.length}`); }
    if (dateTo)   { params.push(dateTo);   conditions.push(`ch.conciliation_date <= $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT ch.*,
          (SELECT json_agg(t) FROM conciliation_transactions t WHERE t.conciliation_id = ch.id) as transactions
        FROM conciliation_headers ch ${where}
        ORDER BY ch.conciliation_date DESC LIMIT $${params.length+1} OFFSET $${params.length+2}
      `, [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM conciliation_headers ch ${where}`, params)
    ]);
    res.json({ success: true, data: dataRes.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/inventory/conciliation-headers
 * Crea o actualiza la cabecera de conciliación de un conductor/fecha.
 * Vincula automáticamente las entregas, devoluciones y repices del día.
 */
export const saveConciliationHeader = async (req: Request, res: Response) => {
  const {
    routeId, vehiclePlate, driverId, driverName,
    conciliationDate, notes, createdBy,
    transactions = []  // array de { invoice, documentId, transactionType, deliveryQty, returnedQty, repiceQty, invoiceValue, collectedValue, paymentMethod, paymentRef, banco, comprobante, returnReason, notes }
  } = req.body;

  if (!vehiclePlate || !driverId) {
    return res.status(400).json({ error: 'vehiclePlate y driverId son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calcular totales a partir de las transacciones
    const totals = transactions.reduce((acc: any, t: any) => {
      if (t.transactionType === 'entrega')    acc.delivered++;
      if (t.transactionType === 'parcial')    acc.partial++;
      if (t.transactionType === 'devolucion') acc.returned++;
      if (t.transactionType === 'repice')    acc.repice++;
      acc.collected   += Number(t.collectedValue  || 0);
      acc.pending     += Number(t.invoiceValue    || 0) - Number(t.collectedValue || 0);
      acc.toReturn    += Number(t.returnedQty     || 0) * Number(t.invoiceValue   || 0);
      return acc;
    }, { delivered: 0, partial: 0, returned: 0, repice: 0, collected: 0, pending: 0, toReturn: 0 });

    const headerRes = await client.query(`
      INSERT INTO conciliation_headers
        (route_id, vehicle_plate, driver_id, driver_name, conciliation_date, total_invoices,
         total_delivered, total_partial, total_returned, total_repice,
         total_collected, total_pending_collect, total_to_return,
         status, notes, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,'borrador',$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      routeId || null, vehiclePlate, driverId, driverName || driverId,
      conciliationDate || null,
      transactions.length, totals.delivered, totals.partial, totals.returned, totals.repice,
      totals.collected, Math.max(0, totals.pending), totals.toReturn,
      notes || null, createdBy
    ]);

    const headerId = headerRes.rows[0]?.id;
    if (!headerId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe una conciliación para esta combinación. Use PATCH para actualizar.' });
    }

    // Insertar transacciones
    for (const t of transactions) {
      await client.query(`
        INSERT INTO conciliation_transactions
          (conciliation_id, document_id, invoice, article_id, customer_name, city,
           transaction_type, delivery_qty, returned_qty, repice_qty,
           invoice_value, collected_value, payment_method, payment_ref,
           banco, comprobante, return_reason, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CURRENT_TIMESTAMP)
      `, [
        headerId, t.documentId || null, t.invoice, t.articleId || null,
        t.customerName || null, t.city || null,
        t.transactionType || 'entrega',
        Number(t.deliveryQty  || 0), Number(t.returnedQty || 0), Number(t.repiceQty || 0),
        Number(t.invoiceValue || 0), Number(t.collectedValue || 0),
        t.paymentMethod || null, t.paymentRef || null,
        t.banco || null, t.comprobante || null,
        t.returnReason || null, t.notes || null
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, headerId, totals });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/inventory/conciliation-headers/:id/approve
 * Aprueba una conciliación (borrador → aprobada)
 */
export const approveConciliationHeader = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approvedBy, status = 'aprobada' } = req.body;
  if (!['cerrada', 'aprobada'].includes(status)) {
    return res.status(400).json({ error: 'status debe ser "cerrada" o "aprobada"' });
  }
  try {
    await pool.query(
      `UPDATE conciliation_headers SET status=$1, approved_by=$2, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
      [status, approvedBy, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── STOCK ACTUAL (Consulta de Inventario) ────────────────────────────────────
export const getInventoryStock = async (req: Request, res: Response) => {
  const { clientId, articleId, location = 'all', dateFrom, dateTo } = req.query as Record<string, string>;
  try {
    const results: { bodega: any[]; vehiculos: any[] } = { bodega: [], vehiculos: [] };

    if (location === 'all' || location === 'bodega') {
      const conds: string[] = ["ic.quantity::numeric > 0"];
      const params: any[] = [];
      if (clientId)  { params.push(clientId);         conds.push(`ic.client_id = $${params.length}`); }
      if (articleId) { params.push(`%${articleId}%`); conds.push(`ic.article_id ILIKE $${params.length}`); }
      if (dateFrom)  { params.push(dateFrom);          conds.push(`ic.last_updated >= $${params.length}`); }
      if (dateTo)    { params.push(dateTo);             conds.push(`ic.last_updated < ($${params.length}::date + INTERVAL '1 day')`); }
      const r = await pool.query(`
        SELECT ic.client_id, c.name AS client_name,
               ic.article_id, COALESCE(a.name, ic.article_id) AS article_name, ic.batch,
               ic.quantity::numeric AS quantity, ic.last_updated, ic.last_user,
               u.name AS last_user_name,
               a.barcode, a.uom_std, a.category_articulo_id, a.image_url,
               'BODEGA' as location
        FROM inventario_clientes ic
        LEFT JOIN articles a  ON a.id  = ic.article_id
        LEFT JOIN clients  c  ON c.id  = ic.client_id
        LEFT JOIN users    u  ON u.id  = ic.last_user
        WHERE ${conds.join(' AND ')}
        ORDER BY ic.article_id
      `, params);
      results.bodega = r.rows;
    }

    if (location === 'all' || location === 'vehiculos') {
      const conds: string[] = ['vi.quantity > 0'];
      const params: any[] = [];
      if (clientId)  { params.push(clientId);         conds.push(`vi.client_id = $${params.length}`); }
      if (articleId) { params.push(`%${articleId}%`); conds.push(`vi.article_id ILIKE $${params.length}`); }
      if (dateFrom)  { params.push(dateFrom);          conds.push(`vi.last_updated >= $${params.length}`); }
      if (dateTo)    { params.push(dateTo);             conds.push(`vi.last_updated < ($${params.length}::date + INTERVAL '1 day')`); }
      const r = await pool.query(`
        SELECT vi.vehicle_plate, 
               COALESCE(d.name, vi.driver_name) AS driver_name,
               vi.client_id, c.name AS client_name,
               vi.article_id, COALESCE(a.name, vi.article_name, vi.article_id) AS article_name,
               vi.batch, vi.quantity, vi.last_updated,
               a.barcode, a.uom_std, a.category_articulo_id, a.image_url,
               'VEHICULO' as location
        FROM vehicle_inventory vi
        LEFT JOIN articles a ON a.id = vi.article_id
        LEFT JOIN clients  c ON c.id = vi.client_id
        LEFT JOIN drivers  d ON d.id::text = vi.driver_id::text
        WHERE ${conds.join(' AND ')}
        ORDER BY vi.vehicle_plate, vi.article_id
      `, params);
      results.vehiculos = r.rows;
    }

    res.json({ success: true, ...results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── KARDEX / MOVIMIENTOS ─────────────────────────────────────────────────────
export const getInventoryMovements = async (req: Request, res: Response) => {
  const {
    clientId, articleId, movementType, vehiclePlate, invoice,
    dateFrom, dateTo, page = '1', limit = '100'
  } = req.query as Record<string, string>;
  try {
    const conds: string[] = [];
    const params: any[] = [];
    if (clientId)     { params.push(clientId);         conds.push(`m.client_id = $${params.length}`); }
    if (articleId)    { params.push(`%${articleId}%`); conds.push(`m.article_id ILIKE $${params.length}`); }
    if (movementType) { params.push(movementType);     conds.push(`m.movement_type = $${params.length}`); }
    if (vehiclePlate) { params.push(vehiclePlate);     conds.push(`m.vehicle_plate = $${params.length}`); }
    if (invoice)      { params.push(`%${invoice}%`);   conds.push(`m.invoice ILIKE $${params.length}`); }
    if (dateFrom)     { params.push(dateFrom);         conds.push(`m.created_at >= $${params.length}`); }
    if (dateTo)       { params.push(dateTo);           conds.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`); }

    const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT m.*,
               u.name  AS user_name,
               d.name  AS driver_name_lookup,
               c.name  AS client_name
        FROM inventory_movements m
        LEFT JOIN users   u ON u.id         = m.user_id
        LEFT JOIN drivers d ON d.id::text   = m.driver_id::text
        LEFT JOIN clients c ON c.id         = m.client_id
        ${where}
        ORDER BY m.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) FROM inventory_movements m ${where}`, params),
    ]);

    res.json({ success: true, data: dataRes.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err: any) {
    // Table may not exist yet (pending migration) — return empty gracefully
    if (err.message?.includes('does not exist')) {
      return res.json({ success: true, data: [], total: 0, page: parseInt(page ?? '1'), limit: parseInt(limit ?? '50') });
    }
    res.status(500).json({ error: err.message });
  }
};

// ─── DASHBOARD SUMMARY (Consolidado de Manifiestos/Archivos) ──────────────────
export const getArticleDashboardSummary = async (req: Request, res: Response) => {
  const { articleId } = req.query as Record<string, string>;
  if (!articleId) return res.status(400).json({ error: 'articleId es requerido' });

  try {
    // 1. Resumen de Manifiestos (Archivo vs Conteo)
    const manifestSummaryRes = await pool.query(`
      SELECT 
        SUM(di.expected_qty) as total_expected,
        SUM(di.received_qty) as total_received
      FROM document_items di
      WHERE di.article_id = $1
    `, [articleId]);

    // 2. Listado de Facturas Relacionadas (desde document_items)
    const invoicesRes = await pool.query(`
      SELECT 
        di.invoice,
        di.document_id,
        dl.external_doc_id,
        di.expected_qty,
        di.received_qty,
        di.batch,
        dl.created_at as doc_date,
        dl.vehicle_plate,
        dl.status as doc_status
      FROM document_items di
      JOIN documents_l dl ON dl.id = di.document_id
      WHERE di.article_id = $1
      ORDER BY dl.created_at DESC
      LIMIT 20
    `, [articleId]);

    res.json({
      success: true,
      summary: manifestSummaryRes.rows[0],
      invoices: invoicesRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
