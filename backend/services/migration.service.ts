
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

const UNIVERSAL_SCHEMA: Record<string, string[]> = {
  'roles': ['name', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'modules': ['name', 'icon_class', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'pages': ['name', 'route', 'module_id', 'parent_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'clients': ['name', 'logo_url', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'users': ['email', 'password', 'name', 'role_id', 'document_type', 'document_number', 'phone', 'avatar', 'client_ids', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'two_factor_enabled', 'two_factor_secret'],
  'drivers': ['name', 'document_type', 'document_number', 'phone', 'client_id', 'license_expiry', 'license_pdf', 'status_id', 'license_side_a', 'license_side_b', 'license_category', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'vehicles': ['plate', 'brand', 'owner', 'capacity_m3', 'client_id', 'soat_expiry', 'techno_expiry', 'soat_pdf', 'techno_pdf', 'status_id', 'model_year', 'color', 'vehicle_type', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'master_records': ['category', 'name', 'description', 'parent_id', 'notification_email', 'icon_class', 'status_id', 'created_at', 'created_by', 'updated_at', 'tipo_notificacion_id'],
  'articles': ['name', 'client_id', 'uom_std', 'factor_std', 'status_id', 'barcode', 'category_articulo_id', 'factor_inter', 'uom_general_id', 'uom_inter_id', 'image_url', 'created_by', 'updated_by', 'created_at', 'updated_at', 'sku'],
  'documents_l': ['external_doc_id', 'client_id', 'vehicle_plate', 'codplan', 'delivery_date', 'city', 'status', 'inventory_date', 'inventory_user', 'created_at', 'inventory_observation', 'plan_type', 'inventory_notes', 'tracking_token', 'picking_date', 'receiving_date', 'picker_user', 'deliverer_user', 'receiver_user', 'created_by', 'updated_by', 'updated_at'],
  'document_items': ['document_id', 'article_id', 'expected_qty', 'count_1', 'count_2', 'order_number', 'unit', 'notes', 'item_status', 'un_code', 'client_ref', 'peso', 'invoice', 'volume', 'city', 'address', 'batch', 'observation', 'received_qty', 'unit_volume', 'neighborhood'],
  'user_permissions': ['user_id', 'permissions', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'role_permissions': ['role_id', 'permissions', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'assignments': ['vehicle_id', 'driver_id', 'client_id', 'is_active', 'created_at', 'updated_at'],
  'whatsapp_logs': ['user_id', 'phone_number', 'message_body', 'status', 'direction', 'sent_at', 'external_message_id', 'error_message'],
  'whatsapp_quick_replies': ['user_id', 'title', 'content', 'created_at'],
  'whatsapp_auto_responses': ['user_id', 'trigger_keyword', 'response_content', 'is_active', 'use_ai', 'created_at'],
  'digital_signatures': ['idusuario', 'pasword', 'firma', 'aceptapolitica', 'usuariocreacion', 'estado', 'aprobada', 'usuarioaprobo', 'fechaparobacion', 'fecha_creacion', 'usaurioactualizacion', 'fecha_actualizacion'],
  'tipos_documento': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'marcas': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'tipos_vehiculo': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'unidades_medida': ['name', 'description', 'abbreviation', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'estados': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'notificaciones': ['name', 'description', 'notification_email', 'tipo_notificacion_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'tipos_notificacion': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'routes': ['name', 'description', 'vehicle_id', 'driver_id', 'client_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'picking_assignments': ['invoice_id', 'leader_id', 'helper_ids', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'picking_signatures': ['picking_id', 'user_id', 'signed', 'signed_at'],
  'route_invoices': ['route_id', 'invoice_id', 'created_at'],
  'route_modifications_log': ['route_id', 'invoice_id', 'action', 'user_id', 'previous_plate', 'new_plate', 'details', 'timestamp'],
  'dispatch_assignments': ['invoice_id', 'driver_id', 'helper_ids', 'scanned_items', 'is_accompanied', 'helper_count', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'dispatch_signatures_pending': ['dispatch_id', 'user_id', 'role_type', 'signed', 'signed_at'],
  'delivery_confirmations': ['dispatch_id', 'invoice_id', 'driver_id', 'vehicle_id', 'delivery_type', 'delivered_items', 'notes', 'delivered_at', 'created_at'],
  'delivery_returns': ['confirmation_id', 'invoice_id', 'driver_id', 'vehicle_id', 'return_reason', 'notes', 'status', 'created_at'],
  'delivery_return_items': ['return_id', 'sku', 'article_name', 'quantity_returned', 'quantity_delivered', 'unit', 'notes'],
  'routing_patterns': ['city', 'vehicle_id', 'strength', 'last_used'],
  'deletion_logs': ['table_name', 'record_id', 'record_data', 'deleted_by', 'deleted_at'],
  'vehicle_locations': ['vehicle_id', 'driver_id', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'updated_at', 'timestamp']
};

const healSchema = async (client: any) => {
  console.log('[M7-DB] Iniciando Curación de Esquema...');
  const serialTables = ['assignments', 'dispatch_assignments', 'picking_assignments', 'routes', 'route_invoices', 'route_modifications_log', 'delivery_confirmations', 'delivery_returns', 'delivery_return_items', 'vehicle_locations', 'deletion_logs'];
  
  for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
    const idType = serialTables.includes(table) ? 'SERIAL' : 'TEXT';
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id ${idType} PRIMARY KEY)`);
    for (const col of columns) {
      try {
        let type = 'TEXT';
        if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry') || col === 'fechaparobacion' || col === 'fecha_creacion' || col === 'fecha_actualizacion' || col === 'timestamp' || col === 'last_used' || col === 'updated_at') type = 'TIMESTAMP WITH TIME ZONE';
        if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col === 'peso' || col === 'volume' || col === 'strength' || col === 'latitude' || col === 'longitude' || col === 'accuracy' || col === 'speed' || col === 'heading') type = 'NUMERIC DEFAULT 0';
        if (col === 'client_ids') type = 'TEXT[]';
        if (col === 'permissions' || col === 'record_data') type = 'JSONB';
        if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved') || col === 'aceptapolitica' || col === 'aprobada' || col === 'signed') type = 'BOOLEAN DEFAULT FALSE';

        await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (colErr: any) {
        console.error(`[M7-DB-HEAL] Error en tabla ${table} columna ${col}:`, colErr.message);
      }
    }
  }

  // Creación de Vista GPS (Requerida por Centro de Mando)
  try {
    await client.query(`
      CREATE OR REPLACE VIEW v_latest_vehicle_locations AS
      SELECT DISTINCT ON (vehicle_id)
        vl.id, vl.vehicle_id, vl.driver_id, vl.latitude, vl.longitude, 
        vl.accuracy, vl.speed, vl.heading, vl.updated_at,
        v.plate, d.name as driver_name
      FROM vehicle_locations vl
      LEFT JOIN vehicles v ON vl.vehicle_id = v.id
      LEFT JOIN drivers d ON vl.driver_id = d.id
      ORDER BY vehicle_id, updated_at DESC;
    `);
  } catch (viewErr: any) {
    console.error('[M7-DB-VIEW] Error al crear vista GPS:', viewErr.message);
  }

  console.log('[M7-DB] Curación de Esquema Finalizada.');

  // Harmonización de SERIALs
  for (const table of serialTables) {
    try {
      const typeCheck = await client.query(`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = 'id'
      `);
      if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'text') {
        console.log(`[M7-DB-HEAL] Convirtiendo ${table}.id de TEXT a INTEGER (Harmonización SERIAL)...`);
        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq`);
        await client.query(`
          ALTER TABLE ${table} 
          ALTER COLUMN id TYPE INTEGER 
          USING (CASE WHEN id ~ '^[0-9]+$' THEN id::INTEGER ELSE nextval('${table}_id_seq') END)
        `);
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq')`);
        await client.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1)`);
      }
    } catch (e: any) {
      console.warn(`[M7-DB-HEAL] Advertencia en harmonización de ${table}:`, e.message);
    }
  }
};

export const restoreSystem = async () => {
  console.log('[M7-SYSTEM] Checking Database Consistency... (Emergency Deploy V8)');
  const client = await pool.connect();
  try {
    await healSchema(client);
    await client.query('BEGIN');
    
    // -----------------------------------------------------------------
    // SEMILLAS DE DATOS MAESTROS (Garantizar paridad Local-Cloud)
    // -----------------------------------------------------------------
    
    // 1. Estados Globales
    console.log('[M7-SEED] Registrando Estados...');
    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
      ('EST-01', 'ACTIVO', 'EST-01'),
      ('EST-02', 'INACTIVO', 'EST-01'),
      ('EST-08', 'INVENTARIADO', 'EST-01'),
      ('EST-10', 'ASIGNADO', 'EST-01'),
      ('EST-11', 'EN RUTA', 'EST-01'),
      ('EST-12', 'ENTREGADO', 'EST-01'),
      ('EST-13', 'DEVUELTO', 'EST-01'),
      ('EST-14', 'ENTREGA PARCIAL', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 2. Roles
    console.log('[M7-SEED] Registrando Roles...');
    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES
      ('ROL-01', 'Super Admin', 'EST-01'),
      ('ROL-02', 'ADMIN', 'EST-01'),
      ('ROL-03', 'CONDUCTORES', 'EST-01'),
      ('ROL-04', 'AUXILIARES', 'EST-01'),
      ('ROL-05', 'CLIENTES', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 3. Clientes Críticos
    await client.query(`
      INSERT INTO clients (id, name, status_id) VALUES
      ('CLI-01', 'AJOVER S.A.S', 'EST-01'),
      ('CLI-02', 'DARNEL', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 4. Unidades de Medida
    await client.query(`
      INSERT INTO unidades_medida (id, name, abbreviation, status_id) VALUES
      ('UOM-001', 'Unidad', 'UND', 'EST-01'),
      ('UOM-014', 'Caja', 'CJ', 'EST-01'),
      ('UOM-002', 'Kilogramo', 'KG', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 5. Marcas y Categorías
    await client.query(`
      INSERT INTO marcas (id, name, status_id) VALUES
      ('MAR-001', 'Hino', 'EST-01'),
      ('MAR-027', 'Foton', 'EST-01'),
      ('MAR-022', 'BYD', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO master_records (id, category, name, status_id) VALUES
      ('CAT-001', 'category_articulo', 'PRODUCTO TERMINADO', 'EST-01'),
      ('CAT-002', 'category_articulo', 'MATERIA PRIMA', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 6. Tipos de Vehículo y Documento
    await client.query(`
      INSERT INTO tipos_vehiculo (id, name, status_id) VALUES
      ('TVE-01', 'Sencillo', 'EST-01'),
      ('TVE-02', 'Turbo', 'EST-01'),
      ('TVE-03', 'Tractocamión', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO tipos_documento (id, name, status_id) VALUES
      ('TDO-01', 'Factura de Venta', 'EST-01'),
      ('TDO-02', 'Remisión', 'EST-01'),
      ('TDO-03', 'Orden de Salida', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 7. Módulos y Páginas (Estructura de Navegación)
    await client.query(`
      INSERT INTO modules (id, name, icon_class) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
      ('MOD-02', 'GESTIÓN AJOVER', 'Package'),
      ('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield'),
      ('MOD-05', 'M7 INTELLIGENCE', 'Brain'),
      ('MOD-06', 'ADMINISTRACIÓN', 'Database')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES 
      ('PAG-01', 'USUARIOS', 'users', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-02', 'ROLES', 'roles', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-10', 'DESPACHO INTELIGENTE', 'despacho', 'MOD-05', 'MOD-05', 'EST-01'),
      ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS', 'FIRMAS DIGITALES', 'firmas', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS-APR', 'APROBAR FIRMA', 'aprobar-firma', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-SQL', 'SQL MANAGER', 'sql-manager', 'MOD-06', 'MOD-06', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET module_id = EXCLUDED.module_id, parent_id = EXCLUDED.parent_id;
    `);

    // 6. Blindaje de Usuario Administrador (Password: admin123)
    const adminPass = 'admin123';
    const adminHash = await bcrypt.hash(adminPass, 10);
    console.log('[M7-DB] Asegurando credenciales administrativas...');

    await client.query(`DELETE FROM users WHERE email = 'admin@millasiete.com' AND id != 'USR-01'`);
    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id)
      VALUES ('USR-01', 'admin@millasiete.com', $1, 'SUPER ADMINISTRADOR M7', 'ROL-01', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET password = $1, email = EXCLUDED.email;
    `, [adminHash]);

    // Permisos Full para el Administrador
    const allPages = ['PAG-01','PAG-02','PAG-03','PAG-04','PAG-05','PAG-06','PAG-07','PAG-08','PAG-09','PAG-10',
                      'PAG-11','PAG-12','PAG-13','PAG-14','PAG-15','PAG-16','PAG-17','PAG-18','PAG-19','PAG-20',
                      'PAG-21','PAG-22','PAG-FIRMAS','PAG-FIRMAS-APR','PAG-SQL'];
    const perms: any = { id: "PERM-USER-USR-01", userId: "USR-01", statusId: "EST-01" };
    allPages.forEach(p => {
      ['view', 'create', 'edit', 'delete', 'active'].forEach(a => perms[`page_${p}_${a}`] = true);
    });

    await client.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id)
      VALUES ('PERM-USER-USR-01', 'USR-01', $1, 'EST-01')
      ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;
    `, [JSON.stringify(perms)]);

    await client.query('COMMIT');
    console.log('[M7-DB] Operación de Sincronización Nuclear Exitosa.');
    return { success: true, message: 'Sistema Restaurado y Datos Maestros Sincronizados' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-DB-FATAL] Error en restoreSystem:', err.message);
    throw err;
  } finally {
    client.release();
  }
};
