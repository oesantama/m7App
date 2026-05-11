import pool from '../config/database.js';
import { Request, Response } from 'express';

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
        cxp_date, total_cxp, created_by, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, CURRENT_TIMESTAMP)
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
        updated_at = CURRENT_TIMESTAMP;
    `;

    // Helper functions for cleaning and parsing values
    const parseDate = (val: any): Date | null => {
      if (val === null || val === undefined || val === '') return null;
      
      // If it's already a JS Date object
      if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
      }
      
      // If it's a number (Excel Serial Number or Timestamp)
      if (typeof val === 'number') {
        // If it's a realistic Excel date serial (between 10000 and 100000)
        if (val > 10000 && val < 100000) {
          return new Date(Math.round((val - 25569) * 86400 * 1000));
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      
      const str = String(val).trim();
      if (!str || str.toLowerCase() === 's/i' || str.toLowerCase() === 'null') return null;

      // Matches DD/MM/YYYY HH:MM:SS or DD/MM/YYYY or D/M/YYYY
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

      // Fallback to native ISO/String parsing
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
        user
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

    const { ocNumber, manifestNumber, plate, clientName, fromDate, toDate } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];
    let counter = 1;

    if (ocNumber) {
      conditions.push(`oc_number ILIKE $${counter++}`);
      values.push(`%${ocNumber}%`);
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

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM management_orders ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Data query
    const dataValues = [...values, limit, offset];
    const dataQuery = `
      SELECT * FROM management_orders 
      ${whereClause} 
      ORDER BY manifest_date DESC, created_at DESC 
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
