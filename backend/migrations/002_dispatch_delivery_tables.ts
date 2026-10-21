import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration002: Migration = {
  id: '002_dispatch_delivery_tables',
  name: 'Tablas de confirmación de entregas, devoluciones y novedades de inventario',
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_confirmations (
        id          SERIAL PRIMARY KEY,
        dispatch_id TEXT,
        invoice_id  TEXT NOT NULL,
        driver_id   TEXT NOT NULL,
        vehicle_id  TEXT,
        delivery_type TEXT NOT NULL CHECK (delivery_type IN ('FULL','PARTIAL','RETURN','REPICE')),
        delivered_items JSONB DEFAULT '[]',
        notes       TEXT,
        delivered_at TIMESTAMPTZ DEFAULT NOW(),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS delivery_returns (
        id          SERIAL PRIMARY KEY,
        invoice_id  TEXT NOT NULL,
        driver_id   TEXT,
        vehicle_id  TEXT,
        notes       TEXT,
        status      TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','CANCELLED')),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS delivery_return_items (
        id                  SERIAL PRIMARY KEY,
        return_id           TEXT NOT NULL,
        article_id          TEXT,
        un_code             TEXT,
        quantity_returned   TEXT,
        unit                TEXT
      );

      CREATE TABLE IF NOT EXISTS inventory_news (
        id SERIAL PRIMARY KEY,
        document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
        article_id TEXT,
        quantity NUMERIC DEFAULT 0,
        observation TEXT,
        photo_urls TEXT[], 
        user_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoice_conciliations (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        invoice_number TEXT,
        banco TEXT,
        valor NUMERIC DEFAULT 0,
        comprobante TEXT,
        fecha_pago DATE,
        forma_pago TEXT,
        numero_cheque TEXT,
        es_devolucion BOOLEAN DEFAULT FALSE,
        conciliado_por TEXT,
        vehicle_plate TEXT,
        conductor_id TEXT,
        conductor_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS bodega_received_at TIMESTAMPTZ;
      ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS bodega_received_by TEXT;
      ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS sobrecosto NUMERIC DEFAULT 0;
      ALTER TABLE invoice_conciliations ADD COLUMN IF NOT EXISTS items_returned JSONB DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS bodega_receipts (
        id SERIAL PRIMARY KEY,
        invoice TEXT NOT NULL,
        document_id TEXT NOT NULL,
        client_id TEXT,
        received_by TEXT,
        observation TEXT,
        items JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }
};
