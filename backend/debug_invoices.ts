
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});

async function debug() {
  try {
    console.log('--- RESUMEN DE CLIENTES EN DOCUMENTOS_L ---');
    const clientsRes = await pool.query("SELECT DISTINCT client_id FROM documents_l");
    console.log(clientsRes.rows);

    console.log('\n--- ÚLTIMOS 5 DOCUMENTOS ---');
    const docsRes = await pool.query("SELECT id, external_doc_id, client_id, status, created_at FROM documents_l ORDER BY created_at DESC LIMIT 5");
    console.log(docsRes.rows);

    const lastDocId = docsRes.rows[0]?.id;
    if (lastDocId) {
      console.log(`\n--- ÍTEMS DEL ÚLTIMO DOCUMENTO (${lastDocId}) ---`);
      const itemsRes = await pool.query("SELECT id, invoice, order_number, item_status, expected_qty FROM document_items WHERE document_id = $1 LIMIT 10", [lastDocId]);
      console.log(itemsRes.rows);
    }

    console.log('\n--- CONTEO DE FACTURAS SEGÚN LÓGICA GETINVOICES ---');
    const countRes = await pool.query(`
      SELECT COUNT(*) 
      FROM document_items
      LEFT JOIN documents_l ON document_items.document_id = documents_l.id
      WHERE (document_items.item_status = 'Pendiente' OR document_items.item_status IS NULL)
        AND (
          (document_items.invoice IS NOT NULL AND document_items.invoice != '' AND document_items.invoice != 'S/I')
          OR 
          (document_items.order_number IS NOT NULL AND document_items.order_number != '' AND document_items.order_number != 'S/I')
        )
    `);
    console.log('Facturas totales aptas (sin filtro clientId):', countRes.rows[0].count);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

debug();
