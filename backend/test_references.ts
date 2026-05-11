import pool from './config/database.js';

async function test() {
  try {
    console.log('Querying Database with casted UNION ALL query...');
    const query = `
            SELECT 
              'individual' AS type,
              ic.document_id,
              ic.invoice_number,
              ic.vehicle_plate,
              ic.conductor_name,
              dl.external_doc_id,
              ic.valor::text AS valor,
              ic.fecha_pago::text AS fecha
            FROM invoice_conciliations ic
            LEFT JOIN documents_l dl ON dl.id::text = ic.document_id::text OR dl.external_doc_id = ic.document_id
            WHERE TRIM(UPPER(ic.comprobante)) = TRIM(UPPER($1))

            UNION ALL

            SELECT 
              'grupal' AS type,
              rgp.document_id,
              NULL AS invoice_number,
              rgp.plate AS vehicle_plate,
              NULL AS conductor_name,
              dl.external_doc_id,
              rgp.valor::text AS valor,
              rgp.fecha::text AS fecha
            FROM route_group_payments rgp
            LEFT JOIN documents_l dl ON dl.id::text = rgp.document_id::text OR dl.external_doc_id = rgp.document_id
            WHERE TRIM(UPPER(rgp.referencia)) = TRIM(UPPER($1))
    `;
    const res = await pool.query(query, ['123456']);
    console.log('Result:', JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
