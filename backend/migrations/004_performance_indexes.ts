import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration004: Migration = {
  id: '004_performance_indexes',
  name: 'Índices críticos de alto rendimiento para joins logísticos y vista GPS',
  up: async (client: PoolClient) => {
    const statements = [
      `CREATE UNIQUE INDEX IF NOT EXISTS geocoding_cache_address_key_idx ON geocoding_cache (address_key)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_conciliations_doc_inv ON invoice_conciliations (document_id, invoice_number)`,
      `CREATE INDEX IF NOT EXISTS idx_document_items_document_id ON document_items (document_id)`,
      `CREATE INDEX IF NOT EXISTS idx_document_items_article_id  ON document_items (article_id)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_l_client_id   ON documents_l (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_l_status       ON documents_l (status)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_l_created_at   ON documents_l (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_vehicle_locations_vehicle_id  ON vehicle_locations (vehicle_id)`,
      `CREATE INDEX IF NOT EXISTS idx_vehicle_locations_updated_at  ON vehicle_locations (updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_vehicle_locations_latest ON vehicle_locations (vehicle_id, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_articles_client_id ON articles (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_articles_sku       ON articles (sku)`,
      `CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_invoice_id ON dispatch_assignments (invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_picking_assignments_invoice_id  ON picking_assignments  (invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assignments_driver_id  ON assignments (driver_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assignments_vehicle_id ON assignments (vehicle_id)`,
      `CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address_key ON geocoding_cache (address_key)`,
      `CREATE INDEX IF NOT EXISTS idx_document_items_invoice ON document_items (invoice)`,
      `CREATE INDEX IF NOT EXISTS idx_route_group_payments_doc ON route_group_payments (document_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dispatch_asgn_invoice_id ON dispatch_assignments (invoice_id, id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_l_plan_type ON documents_l (plan_type)`,
      `CREATE INDEX IF NOT EXISTS idx_routes_created_at_status ON routes (created_at DESC, status_id)`,
      `CREATE INDEX IF NOT EXISTS idx_route_invoices_route_inv ON route_invoices (route_id, invoice_id)`,
      `CREATE OR REPLACE VIEW v_latest_vehicle_locations AS
        SELECT DISTINCT ON (vehicle_id)
          vl.id, vl.vehicle_id, vl.driver_id, vl.latitude, vl.longitude, 
          vl.accuracy, vl.speed, vl.heading, vl.updated_at, v.plate, d.name as driver_name
        FROM vehicle_locations vl
        LEFT JOIN vehicles v ON vl.vehicle_id = v.id
        LEFT JOIN drivers d ON vl.driver_id = d.id
        ORDER BY vehicle_id, updated_at DESC;`
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
      } catch (err: any) {
        console.warn(`[M7-MIGRATION-004] Aviso al crear índice/vista: ${err.message}`);
      }
    }
  }
};
