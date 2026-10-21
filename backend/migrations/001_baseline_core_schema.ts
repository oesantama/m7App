import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration001: Migration = {
  id: '001_baseline_core_schema',
  name: 'Esquema base de tablas operativas principales M7',
  up: async (client: PoolClient) => {
    // Verificar si la base de datos ya contiene la tabla base 'users'
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      ) as exists;
    `);

    const hasUsersTable = tableCheck.rows[0]?.exists;
    if (hasUsersTable) {
      console.log('[M7-MIGRATION-001] Base de datos existente detectada. Esquema base consolidado.');
      return;
    }

    console.log('[M7-MIGRATION-001] Base de datos limpia detectada. Inicializando tablas maestras nucleares...');

    // Tablas maestras iniciales
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT,
        icon_class TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        name TEXT,
        route TEXT,
        module_id TEXT,
        parent_id TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT,
        logo_url TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        short_name TEXT,
        report_type TEXT,
        client_type TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        email TEXT UNIQUE,
        password TEXT,
        name TEXT,
        role_id TEXT,
        document_type TEXT,
        document_number TEXT,
        phone TEXT,
        avatar TEXT,
        client_ids TEXT[],
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        permissions JSONB,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        two_factor_secret TEXT
      );

      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        name TEXT,
        document_type TEXT,
        document_number TEXT,
        phone TEXT,
        client_id TEXT,
        license_expiry TIMESTAMP WITH TIME ZONE,
        license_pdf TEXT,
        status_id TEXT,
        license_side_a TEXT,
        license_side_b TEXT,
        license_category TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        plate TEXT UNIQUE,
        brand TEXT,
        owner TEXT,
        capacity_m3 NUMERIC DEFAULT 0,
        client_id TEXT,
        soat_expiry TIMESTAMP WITH TIME ZONE,
        techno_expiry TIMESTAMP WITH TIME ZONE,
        soat_pdf TEXT,
        techno_pdf TEXT,
        status_id TEXT,
        model_year TEXT,
        color TEXT,
        vehicle_type TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        name TEXT,
        client_id TEXT,
        uom_std TEXT,
        factor_std NUMERIC DEFAULT 0,
        status_id TEXT,
        barcode TEXT,
        category_articulo_id TEXT,
        factor_inter NUMERIC DEFAULT 0,
        uom_general_id TEXT,
        uom_inter_id TEXT,
        image_url TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sku TEXT,
        auto_created BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS documents_l (
        id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
        external_doc_id TEXT,
        client_id TEXT,
        vehicle_plate TEXT,
        remesatdm TEXT,
        delivery_date TIMESTAMP WITH TIME ZONE,
        city TEXT,
        status TEXT,
        inventory_date TIMESTAMP WITH TIME ZONE,
        inventory_start TIMESTAMP WITH TIME ZONE,
        inventory_user TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        inventory_observation TEXT,
        plan_type TEXT,
        inventory_notes TEXT,
        tracking_token TEXT,
        picking_date TIMESTAMP WITH TIME ZONE,
        receiving_date TIMESTAMP WITH TIME ZONE,
        picker_user TEXT,
        deliverer_user TEXT,
        receiver_user TEXT,
        created_by TEXT,
        updated_by TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        delete_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS document_items (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        article_id TEXT,
        expected_qty NUMERIC DEFAULT 0,
        count_1 NUMERIC DEFAULT 0,
        count_2 NUMERIC DEFAULT 0,
        order_number TEXT,
        unit TEXT,
        notes TEXT,
        item_status TEXT,
        un_code TEXT,
        client_ref TEXT,
        peso NUMERIC DEFAULT 0,
        invoice TEXT,
        volume NUMERIC DEFAULT 0,
        city TEXT,
        address TEXT,
        batch TEXT,
        observation TEXT,
        received_qty NUMERIC DEFAULT 0,
        unit_volume NUMERIC DEFAULT 0,
        neighborhood TEXT,
        customer_name TEXT,
        latitude NUMERIC DEFAULT 0,
        longitude NUMERIC DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name TEXT,
        description TEXT,
        vehicle_id TEXT,
        driver_id TEXT,
        client_id TEXT,
        status_id TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        total_volume_m3 NUMERIC DEFAULT 0,
        vehicle_capacity_m3 NUMERIC DEFAULT 0,
        utilization_pct NUMERIC DEFAULT 0,
        shift INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS route_invoices (
        id SERIAL PRIMARY KEY,
        route_id INTEGER,
        invoice_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dispatch_assignments (
        id SERIAL PRIMARY KEY,
        invoice_id TEXT,
        driver_id TEXT,
        helper_ids TEXT,
        scanned_items TEXT,
        is_accompanied BOOLEAN DEFAULT FALSE,
        helper_count NUMERIC DEFAULT 0,
        status TEXT,
        created_by TEXT,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vehicle_locations (
        id SERIAL PRIMARY KEY,
        vehicle_id TEXT,
        driver_id TEXT,
        latitude NUMERIC DEFAULT 0,
        longitude NUMERIC DEFAULT 0,
        accuracy NUMERIC DEFAULT 0,
        speed NUMERIC DEFAULT 0,
        heading NUMERIC DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS geocoding_cache (
        id SERIAL PRIMARY KEY,
        address_key TEXT UNIQUE,
        address TEXT,
        city TEXT,
        lat NUMERIC DEFAULT 0,
        lng NUMERIC DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
};
