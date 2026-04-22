
import pool from './backend/config/database.js';

async function testQuery() {
    const clientId = 'CLI-01';
    const where = "WHERE dl.client_id = 'CLI-01'";
    const params = [];
    
    const query = `
            SELECT 
                dl.id,
                dl.external_doc_id,
                dl.vehicle_plate,
                dl.delivery_date,
                dl.client_id,
                COUNT(DISTINCT di.invoice)                                  AS total_invoices,
                COUNT(DISTINCT ic.invoice_number)                           AS conciliadas,
                COUNT(DISTINCT di.invoice) - COUNT(DISTINCT ic.invoice_number) AS pendientes,
                
                -- Totales financieros
                COALESCE(SUM(CASE WHEN ic.forma_pago = 'EFECTIVO' THEN ic.valor ELSE 0 END), 0) AS total_efectivo,
                COALESCE(SUM(CASE WHEN ic.forma_pago IN ('TRANSFERENCIA', 'CONSIGNACION') THEN ic.valor ELSE 0 END), 0) AS total_consignado,
                
                -- Nuevo: Total crédito (Plan R)
                COALESCE(SUM(
                    CASE WHEN UPPER(TRIM(p.metodo_pago)) NOT LIKE '%EFECTIVO%'
                         AND UPPER(TRIM(p.metodo_pago)) NOT LIKE '%EFE%'
                    THEN COALESCE(p.vmetodo::numeric, 0) ELSE 0 END
                ), 0)                                                        AS total_credito,

                -- Conductor y placa desde dispatch (última asignación del doc)
                (SELECT da.driver_id FROM dispatch_assignments da
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_id,
                (SELECT u.name FROM dispatch_assignments da
                 LEFT JOIN users u ON u.id = da.driver_id
                 WHERE da.invoice_id = dl.id ORDER BY da.id DESC LIMIT 1)   AS conductor_name,

                -- Sobrecostos de ruta acumulados
                (SELECT COALESCE(SUM(valor), 0) FROM route_surcharges rs WHERE rs.document_id = dl.id) AS total_sobrecosto_ruta

            FROM documents_l dl
            LEFT JOIN document_items di ON di.document_id = dl.id AND di.invoice IS NOT NULL AND di.invoice <> ''
            LEFT JOIN invoice_conciliations ic ON ic.document_id = dl.id AND ic.invoice_number = di.invoice
            LEFT JOIN document_l_payments p ON p.invoice IS NOT NULL AND TRIM(UPPER(p.invoice)) = TRIM(UPPER(di.invoice))

            ${where}
            GROUP BY dl.id
            HAVING COUNT(DISTINCT di.invoice) > 0
              AND COUNT(DISTINCT di.invoice) - COUNT(DISTINCT ic.invoice_number) > 0
            ORDER BY dl.created_at DESC
    `;

    try {
        console.log('Running test query...');
        const res = await pool.query(query, params);
        console.log('Success! Rows:', res.rows.length);
    } catch (err: any) {
        console.error('FAILED:', err);
        if (err.hint) console.log('HINT:', err.hint);
    } finally {
        await pool.end();
    }
}

testQuery();
