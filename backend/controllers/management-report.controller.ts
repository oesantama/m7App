import pool from '../config/database.js';
import { Request, Response } from 'express';

// Shared Helper functions for cleaning and parsing values
const parseDate = (val: any): Date | null => {
  if (val === null || val === undefined || val === '') return null;
  
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  if (typeof val === 'number') {
    if (val > 10000 && val < 100000) {
      return new Date(Math.round((val - 25569) * 86400 * 1000));
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 's/i' || str.toLowerCase() === 'null') return null;

  const dmyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/;
  const match = str.match(dmyRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // Month is 0-indexed
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;
    const second = match[6] ? parseInt(match[6], 10) : 0;
    
    const d = new Date(year, month, day, hour, minute, second);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const parseNum = (val: any) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

const cleanStr = (val: any) => {
  if (val === null || val === undefined) return '';
  return String(val).trim();
};

/**
 * Controller to handle Excel row parsing and UPSERTing inside a transaction
 */
export const uploadReports = async (req: Request, res: Response) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'No se recibieron registros para importar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (req as any).user?.name || 'SYSTEM_UPLOAD';

    const insertQuery = `
      INSERT INTO management_orders (
        oc_number, oc_status, oc_date, remesa_number, remission,
        remission_status, remission_date, manifest_number, client_order,
        manifest_observations, manifest_status, manifest_date, plate,
        client_name, total_value_cxc_final, total_value_cxp_final,
        invoice_cxc, receipt, invoice_date, total_cxc, egress,
        cxp_date, total_cxp, created_by, updated_at, client_document, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, CURRENT_TIMESTAMP, $25, $26)
      ON CONFLICT (oc_number) DO UPDATE SET
        oc_status = EXCLUDED.oc_status,
        oc_date = EXCLUDED.oc_date,
        remesa_number = EXCLUDED.remesa_number,
        remission = EXCLUDED.remission,
        remission_status = EXCLUDED.remission_status,
        remission_date = EXCLUDED.remission_date,
        manifest_number = EXCLUDED.manifest_number,
        client_order = EXCLUDED.client_order,
        manifest_observations = EXCLUDED.manifest_observations,
        manifest_status = EXCLUDED.manifest_status,
        manifest_date = EXCLUDED.manifest_date,
        plate = EXCLUDED.plate,
        client_name = EXCLUDED.client_name,
        total_value_cxc_final = EXCLUDED.total_value_cxc_final,
        total_value_cxp_final = EXCLUDED.total_value_cxp_final,
        invoice_cxc = EXCLUDED.invoice_cxc,
        receipt = EXCLUDED.receipt,
        invoice_date = EXCLUDED.invoice_date,
        total_cxc = EXCLUDED.total_cxc,
        egress = EXCLUDED.egress,
        cxp_date = EXCLUDED.cxp_date,
        total_cxp = EXCLUDED.total_cxp,
        client_document = EXCLUDED.client_document,
        city = EXCLUDED.city,
        updated_at = CURRENT_TIMESTAMP;
    `;

    let insertedCount = 0;
    for (const row of records) {
      const oc_number = cleanStr(row.ocNumber || row['Número OC']);
      if (!oc_number) continue; // Skip rows without unique purchase order number

      const values = [
        oc_number,
        cleanStr(row.ocStatus || row['Estado OC']),
        parseDate(row.ocDate || row['Fecha OC']),
        cleanStr(row.remesaNumber || row['Número Remesa']),
        cleanStr(row.remission || row['Remisión']),
        cleanStr(row.remissionStatus || row['Estado Remesa']),
        parseDate(row.remissionDate || row['Fecha Remesa']),
        cleanStr(row.manifestNumber || row['Número Manifiesto']),
        cleanStr(row.clientOrder || row['Orden Cliente']),
        cleanStr(row.manifestObservations || row['Observaciones Manifiesto']),
        cleanStr(row.manifestStatus || row['Estado Manifiesto']),
        parseDate(row.manifestDate || row['Fecha Manifiesto']),
        cleanStr(row.plate || row['Placa']),
        cleanStr(row.clientName || row['Nombre Cliente']),
        parseNum(row.totalValueCxcFinal || row['Valor Total CXC final']),
        parseNum(row.totalValueCxpFinal || row['Valor Tot CXP final']),
        cleanStr(row.invoiceCxc || row['Factura CXC']),
        cleanStr(row.receipt || row['Recibo']),
        parseDate(row.invoiceDate || row['Fecha Factura']),
        parseNum(row.totalCxc || row['Total CXC']),
        cleanStr(row.egress || row['Egreso']),
        parseDate(row.cxpDate || row['Fecha CXP']),
        parseNum(row.totalCxp || row['Total CXP']),
        user,
        cleanStr(row.clientDocument || row['Documento Cliente'] || row['NIT Cliente'] || row['Nit Cliente'] || row['NIT cliente'] || row['Documento cliente']),
        cleanStr(row.city || row['Origen'] || row['origen'] || row['ORIGEN'] || '').toUpperCase() || null
      ];

      await client.query(insertQuery, values);
      insertedCount++;
    }

    await client.query('COMMIT');
    res.json({ success: true, count: insertedCount, message: `Se importaron ${insertedCount} registros con éxito` });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-MGT-UPLOAD-ERR]', err);
    res.status(500).json({ error: 'Error al procesar e insertar los registros en la base de datos', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * Controller to handle server-side paginated list with search filters
 */
export const getReports = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const { ocNumber, manifestNumber, plate, clientName, fromDate, toDate, sortBy, sortDirection } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];
    let counter = 1;

    if (ocNumber) {
      conditions.push(`(
        oc_number ILIKE $${counter} OR 
        oc_status ILIKE $${counter} OR 
        remesa_number ILIKE $${counter} OR 
        remission ILIKE $${counter} OR 
        manifest_number ILIKE $${counter} OR 
        plate ILIKE $${counter} OR 
        client_name ILIKE $${counter} OR 
        invoice_cxc ILIKE $${counter} OR 
        receipt ILIKE $${counter} OR 
        egress ILIKE $${counter} OR 
        client_order ILIKE $${counter}
      )`);
      values.push(`%${ocNumber}%`);
      counter++;
    }
    if (manifestNumber) {
      conditions.push(`manifest_number ILIKE $${counter++}`);
      values.push(`%${manifestNumber}%`);
    }
    if (plate) {
      conditions.push(`plate ILIKE $${counter++}`);
      values.push(`%${plate}%`);
    }
    if (clientName) {
      conditions.push(`client_name ILIKE $${counter++}`);
      values.push(`%${clientName}%`);
    }
    if (fromDate) {
      conditions.push(`(manifest_date AT TIME ZONE 'America/Bogota')::date >= $${counter++}`);
      values.push(fromDate);
    }
    if (toDate) {
      conditions.push(`(manifest_date AT TIME ZONE 'America/Bogota')::date <= $${counter++}`);
      values.push(toDate);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Validate and build ORDER BY sorting direction and column safely
    const allowedSortFields = [
      'oc_number', 'oc_status', 'oc_date', 'remesa_number', 'remission', 
      'remission_status', 'remission_date', 'manifest_number', 'client_order', 
      'manifest_status', 'manifest_date', 'plate', 'client_name', 
      'total_value_cxc_final', 'total_value_cxp_final', 'invoice_cxc', 
      'receipt', 'invoice_date', 'total_cxc', 'egress', 'cxp_date', 
      'total_cxp', 'fecha_recibo', 'fecha_egreso', 'created_at', 'updated_at', 'client_document'
    ];

    let orderByColumn = 'manifest_date';
    if (sortBy && typeof sortBy === 'string') {
      const cleanSort = sortBy.trim();
      const mapping: { [key: string]: string } = {
        ocNumber: 'oc_number',
        oc_number: 'oc_number',
        ocStatus: 'oc_status',
        oc_status: 'oc_status',
        ocDate: 'oc_date',
        oc_date: 'oc_date',
        remesaNumber: 'remesa_number',
        remesa_number: 'remesa_number',
        remission: 'remission',
        manifestNumber: 'manifest_number',
        manifest_number: 'manifest_number',
        clientOrder: 'client_order',
        client_order: 'client_order',
        manifestStatus: 'manifest_status',
        manifest_status: 'manifest_status',
        manifestDate: 'manifest_date',
        manifest_date: 'manifest_date',
        plate: 'plate',
        clientName: 'client_name',
        client_name: 'client_name',
        totalValueCxcFinal: 'total_value_cxc_final',
        total_value_cxc_final: 'total_value_cxc_final',
        totalValueCxpFinal: 'total_value_cxp_final',
        total_value_cxp_final: 'total_value_cxp_final',
        invoiceCxc: 'invoice_cxc',
        invoice_cxc: 'invoice_cxc',
        receipt: 'receipt',
        invoiceDate: 'invoice_date',
        invoice_date: 'invoice_date',
        totalCxc: 'total_cxc',
        total_cxc: 'total_cxc',
        egress: 'egress',
        cxpDate: 'cxp_date',
        cxp_date: 'cxp_date',
        totalCxp: 'total_cxp',
        total_cxp: 'total_cxp',
        fechaRecibo: 'fecha_recibo',
        fecha_recibo: 'fecha_recibo',
        fechaEgreso: 'fecha_egreso',
        fecha_egreso: 'fecha_egreso',
        clientDocument: 'client_document',
        client_document: 'client_document'
      };

      if (mapping[cleanSort]) {
        orderByColumn = mapping[cleanSort];
      } else if (allowedSortFields.includes(cleanSort)) {
        orderByColumn = cleanSort;
      }
    }

    const direction = sortDirection === 'asc' ? 'ASC' : 'DESC';

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM management_orders ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Data query
    const dataValues = [...values, limit, offset];
    const dataQuery = `
      SELECT * FROM management_orders 
      ${whereClause} 
      ORDER BY ${orderByColumn} ${direction}, created_at DESC 
      LIMIT $${counter++} OFFSET $${counter++}
    `;
    const dataResult = await pool.query(dataQuery, dataValues);

    res.json({
      records: dataResult.rows,
      total,
      page,
      limit
    });
  } catch (err: any) {
    console.error('[M7-MGT-GET-ERR]', err);
    res.status(500).json({ error: 'Error al consultar el reporte de gerencia', details: err.message });
  }
};

/**
 * Controller to handle mass receipt date updates by matching Consecutivo to receipt
 */
export const uploadReceiptDates = async (req: Request, res: Response) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'No se recibieron registros para importar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE management_orders 
      SET fecha_recibo = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE receipt = $2;
    `;

    let updatedCount = 0;
    for (const row of records) {
      const receiptNum = cleanStr(row.consecutive || row['Consecutivo']);
      const receiptDate = parseDate(row.date || row['Fecha']);

      if (!receiptNum || !receiptDate) continue;

      const result = await client.query(updateQuery, [receiptDate, receiptNum]);
      updatedCount += result.rowCount || 0;
    }

    await client.query('COMMIT');
    res.json({ success: true, count: updatedCount, message: `Se actualizaron ${updatedCount} fechas de recibido con éxito` });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-MGT-RECEIPT-UPDATE-ERR]', err);
    res.status(500).json({ error: 'Error al actualizar las fechas de recibido', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * Controller to handle mass egress date updates by matching Consecutivo to egress
 */
export const uploadEgressDates = async (req: Request, res: Response) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'No se recibieron registros para importar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE management_orders 
      SET fecha_egreso = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE egress = $2;
    `;

    let updatedCount = 0;
    for (const row of records) {
      const egressNum = cleanStr(row.consecutive || row['Consecutivo']);
      const egressDate = parseDate(row.date || row['Fecha']);

      if (!egressNum || !egressDate) continue;

      const result = await client.query(updateQuery, [egressDate, egressNum]);
      updatedCount += result.rowCount || 0;
    }

    await client.query('COMMIT');
    res.json({ success: true, count: updatedCount, message: `Se actualizaron ${updatedCount} fechas de egreso con éxito` });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-MGT-EGRESS-UPDATE-ERR]', err);
    res.status(500).json({ error: 'Error al actualizar las fechas de egreso', details: err.message });
  } finally {
    client.release();
  }
};
