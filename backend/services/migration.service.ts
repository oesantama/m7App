
import pool from '../config/database.js';
import bcrypt from 'bcrypt';

const UNIVERSAL_SCHEMA: Record<string, string[]> = {
  'roles': ['name', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'modules': ['name', 'icon_class', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'pages': ['name', 'route', 'module_id', 'parent_id', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'clients': ['name', 'logo_url', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'users': ['email', 'password', 'name', 'role_id', 'document_type', 'document_number', 'phone', 'avatar', 'client_ids', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'permissions', 'two_factor_enabled', 'two_factor_secret'],
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
  'dispatch_assignments': ['invoice_id', 'driver_id', 'helper_ids', 'scanned_items', 'is_accompanied', 'helper_count', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at', 'created_at'],
  'dispatch_signatures_pending': ['dispatch_id', 'user_id', 'role_type', 'signed', 'signed_at'],
  'delivery_confirmations': ['dispatch_id', 'invoice_id', 'driver_id', 'vehicle_id', 'delivery_type', 'delivered_items', 'notes', 'delivered_at', 'created_at'],
  'delivery_returns': ['confirmation_id', 'invoice_id', 'driver_id', 'vehicle_id', 'return_reason', 'notes', 'status', 'created_at'],
  'delivery_return_items': ['return_id', 'sku', 'article_name', 'quantity_returned', 'quantity_delivered', 'unit', 'notes'],
  'routing_patterns': ['city', 'vehicle_id', 'strength', 'last_used'],
  'deletion_logs': ['table_name', 'record_id', 'record_data', 'deleted_by', 'deleted_at'],
  'vehicle_locations': ['vehicle_id', 'driver_id', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'updated_at', 'timestamp'],
  'training_categories': ['name', 'description', 'created_at'],
  'training_courses': ['category_id', 'title', 'description', 'cover_image', 'level', 'status_id', 'created_at'],
  'training_lessons': ['course_id', 'title', 'content', 'video_url', 'resource_url', '"order"', 'created_at'],
  'user_training_progress': ['user_id', 'lesson_id', 'status', 'finished_at', 'updated_at']
};

const healSchema = async (client: any) => {
  console.log('[M7-DB] Iniciando Curación Nuclear de Esquema (REPLICA EXACTA)...');
  const serialTables = ['assignments', 'dispatch_assignments', 'picking_assignments', 'routes', 'route_invoices', 'route_modifications_log', 'delivery_confirmations', 'delivery_returns', 'delivery_return_items', 'vehicle_locations', 'deletion_logs', 'user_training_progress', 'digital_signatures'];
  
  const nuclearTables = Object.keys(UNIVERSAL_SCHEMA);
  for (const table of nuclearTables) {
    try {
        const checkCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
        const currentCols = checkCols.rows.map((r: any) => r.column_name);
        if (currentCols.length > 0) {
            const expectedCols = ['id', ...UNIVERSAL_SCHEMA[table]];
            const hasExtraCols = currentCols.some((c: string) => !expectedCols.includes(c));
            if (hasExtraCols) {
                console.warn(`[M7-DB-NUCLEAR] Discrepancia detectada en ${table}. Limpiando tabla para réplica exacta...`);
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            }
        }
    } catch (e) {}
  }

  // FASE 2: CURACIÓN ATÓMICA POR TABLA (BATCHING)
  for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
    try {
      const idType = serialTables.includes(table) ? 'SERIAL' : 'TEXT';
      await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id ${idType} PRIMARY KEY)`);

      // Consultar columnas existentes una sola vez
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const existingCols = new Set(colCheck.rows.map((r: any) => r.column_name));

      const alterStatements: string[] = [];
      for (const col of columns) {
        if (!existingCols.has(col)) {
          let type = 'TEXT';
          if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry') || col === 'fechaparobacion' || col === 'fecha_creacion' || col === 'fecha_actualizacion' || col === 'timestamp' || col === 'last_used' || col === 'updated_at' || col === 'created_at') type = 'TIMESTAMP WITH TIME ZONE';
          if (col === 'permissions' || col.endsWith('_ids') || col.includes('items') || col === 'scanned_items' || col === 'helper_ids' || col === 'recent_assignments' || col === 'record_data') type = 'JSONB';
          if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col === 'peso' || col === 'volume' || col === 'strength' || col === 'latitude' || col === 'longitude' || col === 'accuracy' || col === 'speed' || col === 'heading' || col === 'level' || col === 'order') type = 'NUMERIC DEFAULT 0';
          if (col === 'client_ids') type = 'TEXT[]';
          if (col === 'permissions' || col === 'record_data') type = 'JSONB';
          if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved') || col === 'aceptapolitica' || col === 'aprobada' || col === 'signed') type = 'BOOLEAN DEFAULT FALSE';
          
          alterStatements.push(`ADD COLUMN IF NOT EXISTS ${col} ${type}`);
        }
      }

      if (alterStatements.length > 0) {
        console.log(`[M7-DB-HEAL] Aplicando ${alterStatements.length} cambios a ${table}...`);
        await client.query(`ALTER TABLE ${table} ${alterStatements.join(', ')}`);
      }
    } catch (err: any) {
      console.error(`[M7-DB-HEAL] Error crítico en tabla ${table}:`, err.message);
    }
  }

  try {
    await client.query(`
      CREATE OR REPLACE VIEW v_latest_vehicle_locations AS
      SELECT DISTINCT ON (vehicle_id)
        vl.id, vl.vehicle_id, vl.driver_id, vl.latitude, vl.longitude, 
        vl.accuracy, vl.speed, vl.heading, vl.updated_at, v.plate, d.name as driver_name
      FROM vehicle_locations vl
      LEFT JOIN vehicles v ON vl.vehicle_id = v.id
      LEFT JOIN drivers d ON vl.driver_id = d.id
      ORDER BY vehicle_id, updated_at DESC;
    `);
  } catch (e) {}

  for (const table of serialTables) {
    try {
      const typeCheck = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'id'`);
      if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'text') {
        console.log(`[M7-DB-HEAL] Harmonizando SERIAL para ${table}...`);
        
        if (table === 'picking_assignments') {
          await client.query('ALTER TABLE picking_signatures DROP CONSTRAINT IF EXISTS picking_signatures_picking_id_fkey');
          await client.query('ALTER TABLE picking_signatures ALTER COLUMN picking_id TYPE INTEGER USING (picking_id::INTEGER)');
        }
        if (table === 'dispatch_assignments') {
          await client.query('ALTER TABLE dispatch_signatures_pending DROP CONSTRAINT IF EXISTS dispatch_signatures_pending_dispatch_id_fkey');
        }

        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq`);
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id TYPE INTEGER USING (CASE WHEN id ~ '^[0-9]+$' THEN id::INTEGER ELSE nextval('${table}_id_seq') END)`);
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq')`);
        await client.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1)`);

        if (table === 'picking_assignments') {
           await client.query('ALTER TABLE picking_signatures ADD CONSTRAINT picking_signatures_picking_id_fkey FOREIGN KEY (picking_id) REFERENCES picking_assignments(id) ON DELETE CASCADE');
        }
      }
    } catch (e) {}
  }
};

export const restoreSystem = async () => {
  const start = Date.now();
  console.log('[M7-SYSTEM] Checking Consistency... (Nuclear Mode)');
  const client = await pool.connect();
  try {
    await healSchema(client);
    const healEnd = Date.now();
    console.log(`[M7-DB-HEAL] Curación de esquema completada en ${healEnd - start}ms`);

    await client.query('BEGIN');
    
    // SEMILLAS DE DATOS LOCALHOST (Resumen de paridad)
    await client.query(`
      INSERT INTO vehicles (id, plate, brand, owner, capacity_m3, client_id, status_id, model_year, color, vehicle_type) VALUES
      ('VEH-001', 'VEJ 509', 'MAR-022', NULL, 14, 'CLI-02', 'EST-01', '2024', 'gri', 'TV-01'),
      ('VEH-002', 'SXI 118', 'MAR-022', NULL, 23, 'CLI-02', 'EST-01', '2024', 'blanco', 'TVH-001'),
      ('VEH-003', 'JYO 631', 'MAR-022', NULL, 19, 'CLI-04', 'EST-01', '2026', 'blanco', 'TV-02'),
      ('VEH-004', 'WDY 031', 'MAR-022', NULL, 22, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02'),
      ('VEH-005', 'NNN 500', 'MAR-022', NULL, 19, 'CLI-01', 'EST-01', '2026', 'gris', 'TV-02')
      ON CONFLICT (id) DO UPDATE SET plate = EXCLUDED.plate;
    `);

    await client.query(`
      INSERT INTO drivers (id, name, document_type, document_number, phone, client_id, status_id, license_category) VALUES
      ('DRV-001', 'WILLIAM GIL', 'DOC-01', '71578229', '2343234', 'CLI-02', 'EST-01', 'C1'),
      ('DRV-002', 'JAMES SALGADO', 'DOC-01', '94252356', '53324', 'CLI-02', 'EST-01', 'C2'),
      ('DRV-003', 'JAIRO ALVAREZ', 'DOC-01', '1128450159', '323333333', 'CLI-04', 'EST-01', 'C2')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
      ('EST-01', 'ACTIVO', 'EST-01'), ('EST-02', 'INACTIVO', 'EST-01'), ('EST-08', 'INVENTARIADO', 'EST-01'),
      ('EST-10', 'ASIGNADO', 'EST-01'), ('EST-11', 'EN RUTA', 'EST-01'), ('EST-12', 'ENTREGADO', 'EST-01'),
      ('EST-13', 'DEVUELTO', 'EST-01'), ('EST-14', 'ENTREGA PARCIAL', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES
      ('ROL-01', 'Super Admin', 'EST-01'), ('ROL-02', 'ADMIN', 'EST-01'), ('ROL-03', 'CONDUCTORES', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // ── LIMPIAR Y RECONSTRUIR MÓDULOS (Pizarra Limpia = Réplica Exacta) ──────
    await client.query(`
      DELETE FROM pages WHERE id NOT IN (
        'PAG-01','PAG-03','PAG-04','PAG-05','PAG-06','PAG-07','PAG-08','PAG-09','PAG-10','PAG-11',
        'PAG-12','PAG-13','PAG-14','PAG-15','PAG-16','PAG-17',
        'PAG-18','PAG-19','PAG-20','PAG-21','PAG-22','PAG-23','PAG-24',
        'PAG-25','PAG-26','PAG-27','PAG-28','PAG-29','PAG-SQL'
      )
    `);
    await client.query(`
      DELETE FROM modules WHERE id NOT IN ('MOD-01','MOD-02','MOD-03','MOD-04','MOD-05','MOD-06')
    `);

    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
      ('MOD-02', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
      ('MOD-03', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01'),
      ('MOD-05', 'M7 INTELLIGENCE', 'Sparkles', 'EST-01'),
      ('MOD-06', 'ADMINISTRACIÓN', 'Database', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon_class = EXCLUDED.icon_class, status_id = EXCLUDED.status_id;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES 
      -- Maestros (MOD-01)
      ('PAG-01', 'ARTICULOS', 'inventory/items', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-03', 'CLIENTES', 'masterClientes', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-04', 'ESTADOS GLOBALES', 'masterEstados', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-05', 'FIRMAS DIGITALES', 'firmas', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-06', 'MARCAS', 'masterMarcas', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-07', 'NOTIFICACIONES', 'masterNotificaciones', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-08', 'TIPOS DE DOCUMENTO', 'masterTipoDocumento', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-09', 'TIPOS DE VEHÍCULO', 'masterTiposVehiculo', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-10', 'UNIDADES DE MEDIDA', 'masterUnidadMedida', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-11', 'APROBAR FIRMA', 'aprobar-firma', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-28', 'CATEGORÍAS', 'masterCategorias', 'MOD-01', 'MOD-01', 'EST-01'),
      ('PAG-29', 'TIPOS DE NOTIFICACIÓN', 'masterTipoNotificacion', 'MOD-01', 'MOD-01', 'EST-01'),
      
      -- Logística (MOD-02 / MOD-03 RESTRUCTURE)
      ('PAG-12', 'ASIGNACIÓN FLOTA', 'vinculo', 'MOD-02', 'MOD-02', 'EST-01'),
      ('PAG-13', 'DESPACHO LOGÍSTICO', 'despacho', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-14', 'GESTIÓN DE FLOTAS', 'flotas', 'MOD-02', 'MOD-02', 'EST-01'),
      ('PAG-15', 'PLANIFICADOR DE RUTAS', 'rutas', 'MOD-03', 'MOD-03', 'EST-01'),

      -- Inventarios (MOD-03)
      ('PAG-16', 'GESTIÓN DE DOCUMENTOS', 'documentos', 'MOD-03', 'MOD-03', 'EST-01'),
      ('PAG-17', 'RECIBIDO DE MATERIAL', 'recibido', 'MOD-03', 'MOD-03', 'EST-01'),

      -- Seguridad (MOD-04)
      ('PAG-18', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-19', 'MÓDULOS SISTEMA', 'modules', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-20', 'PÁGINAS WEB', 'pages', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-21', 'USUARIOS', 'users', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-22', 'ROLES', 'roles', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-23', 'PERMISOS POR ROL', 'masterPermisosRol', 'MOD-04', 'MOD-04', 'EST-01'),
      ('PAG-24', 'PERMISOS POR USUARIO', 'masterPermisosUsuario', 'MOD-04', 'MOD-04', 'EST-01'),

      -- Inteligencia (MOD-05)
      ('PAG-25', 'DASHBOARD EJECUTIVO', 'executive-dashboard', 'MOD-05', 'MOD-05', 'EST-01'),
      ('PAG-26', 'GAMIFICACIÓN (IA)', 'gamification', 'MOD-05', 'MOD-05', 'EST-01'),
      ('PAG-27', 'M7 CHATBOT', 'chatbot', 'MOD-05', 'MOD-05', 'EST-01'),

      -- Administración (MOD-06)
      ('PAG-SQL', 'Gestor DB', 'admin-db', 'MOD-06', 'MOD-06', 'EST-01')

      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        route = EXCLUDED.route, 
        module_id = EXCLUDED.module_id, 
        parent_id = EXCLUDED.parent_id,
        status_id = EXCLUDED.status_id;
    `);

    const adminHash = await bcrypt.hash('admin123', 10);
    // Limpiar usuarios duplicados del servidor (réplica exacta local)
    // [M7-FIX] Borrar permisos primero para respetar FK user_permissions_user_id_fkey
    await client.query(`DELETE FROM user_permissions WHERE user_id IN ('USR-DEMO', 'USR-02', 'USR-03')`);
    await client.query(`DELETE FROM users WHERE id IN ('USR-DEMO', 'USR-02', 'USR-03') OR (email = 'oscar@millasiete.com' AND id != 'USR-01')`);

    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id, permissions)
      VALUES 
      ('USR-01', 'admin@millasiete.com', $1, 'OSCAR SANTAMARIA', 'ROL-01', 'EST-01', '[{"module": "all", "actions": ["view", "edit", "delete", "create"]}]'::jsonb)
      ON CONFLICT (id) DO UPDATE SET 
        password = $1, 
        permissions = EXCLUDED.permissions,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role_id = EXCLUDED.role_id;
    `, [adminHash]);

    await client.query('COMMIT');

    // FASE FINAL: SINCRONIZACIÓN NUCLEAR DE MENÚS (REUBICACIÓN LOGÍSTICA)
    console.log('[M7-SYNC] Forzando reubicación de módulos logísticos a Gestión Ajover...');
    await client.query(`
      UPDATE pages 
      SET module_id = 'MOD-03', parent_id = 'MOD-03' 
      WHERE id IN ('PAG-13', 'PAG-15');
    `);
    console.log(`[M7-SYNC] Módulos Logísticos Sincronizados con Éxito - ${new Date().toLocaleString()}`);

    const total = Date.now() - start;
    return { success: true, message: `Operación de Sincronización Nuclear Exitosa en ${total}ms. [TS: ${new Date().toISOString()}]` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
