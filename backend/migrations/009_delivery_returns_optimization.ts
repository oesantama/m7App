import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration009: Migration = {
  id: '009_delivery_returns_optimization',
  name: 'Optimización de índices y client_id para pipeline de devoluciones bodega',
  up: async (client: PoolClient) => {
    // 1. Agregar columna client_id a delivery_returns para evitar scans masivos de document_items
    await client.query(`
      ALTER TABLE delivery_returns ADD COLUMN IF NOT EXISTS client_id TEXT;
    `);

    // 2. Poblar retroactivamente client_id en delivery_returns usando documentos existentes
    try {
      await client.query(`
        UPDATE delivery_returns dr
        SET client_id = dl.client_id
        FROM document_items di
        JOIN documents_l dl ON dl.id = di.document_id
        WHERE TRIM(UPPER(COALESCE(NULLIF(di.invoice,''), di.order_number))) = TRIM(UPPER(dr.invoice_id))
          AND dr.client_id IS NULL;
      `);
    } catch (err: any) {
      console.warn(`[M7-MIGRATION-009] Aviso en backfill de client_id: ${err.message}`);
    }

    // 3. Crear índices de alto rendimiento para búsqueda y filtrado instantáneo
    const statements = [
      `CREATE INDEX IF NOT EXISTS idx_delivery_returns_status_client ON delivery_returns (status, client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_delivery_returns_client_id ON delivery_returns (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_delivery_returns_status ON delivery_returns (status)`,
      `CREATE INDEX IF NOT EXISTS idx_delivery_returns_invoice_upper ON delivery_returns (TRIM(UPPER(invoice_id)))`,
      `CREATE INDEX IF NOT EXISTS idx_delivery_return_items_return_id ON delivery_return_items (return_id)`,
      `CREATE INDEX IF NOT EXISTS idx_delivery_return_items_article ON delivery_return_items (article_id)`,
      `CREATE INDEX IF NOT EXISTS idx_document_items_invoice_upper ON document_items (TRIM(UPPER(COALESCE(NULLIF(invoice,''), order_number))))`,
      `CREATE INDEX IF NOT EXISTS idx_doc_items_doc_id_inv_upper ON document_items (document_id, TRIM(UPPER(COALESCE(NULLIF(invoice,''), order_number))))`,
      `CREATE INDEX IF NOT EXISTS idx_document_l_payments_inv_upper ON document_l_payments (TRIM(UPPER(invoice)))`
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
      } catch (err: any) {
        console.warn(`[M7-MIGRATION-009] Aviso al crear índice: ${err.message}`);
      }
    }
  }
};
