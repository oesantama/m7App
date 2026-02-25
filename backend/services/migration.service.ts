
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
  'routes': ['name', 'description', 'status_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  'picking_assignments': ['invoice_id', 'leader_id', 'helper_ids', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'picking_signatures': ['picking_id', 'user_id', 'signed', 'signed_at'],
  'route_invoices': ['route_id', 'invoice_id', 'created_at'],
  'route_modifications_log': ['route_id', 'invoice_id', 'action', 'user_id', 'previous_plate', 'new_plate', 'details', 'timestamp'],
  'dispatch_assignments': ['invoice_id', 'driver_id', 'helper_ids', 'scanned_items', 'is_accompanied', 'helper_count', 'status', 'created_by', 'started_at', 'completed_at', 'updated_at'],
  'dispatch_signatures_pending': ['dispatch_id', 'user_id', 'role_type', 'signed', 'signed_at'],
  'delivery_confirmations': ['dispatch_id', 'invoice_id', 'driver_id', 'vehicle_id', 'delivery_type', 'delivered_items', 'notes', 'delivered_at', 'created_at'],
  'delivery_returns': ['confirmation_id', 'invoice_id', 'driver_id', 'vehicle_id', 'return_reason', 'notes', 'status', 'created_at'],
  'delivery_return_items': ['return_id', 'sku', 'article_name', 'quantity_returned', 'quantity_delivered', 'unit', 'notes']
};

const healSchema = async (client: any) => {
  console.log('[M7-DB] Iniciando Curación de Esquema...');
  const serialTables = ['assignments', 'dispatch_assignments', 'picking_assignments', 'routes', 'route_invoices', 'route_modifications_log', 'delivery_confirmations', 'delivery_returns', 'delivery_return_items'];
  for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
    const idType = serialTables.includes(table) ? 'SERIAL' : 'TEXT';
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id ${idType} PRIMARY KEY)`);
    for (const col of columns) {
      try {
        let type = 'TEXT';
        if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry') || col === 'fechaparobacion' || col === 'fecha_creacion' || col === 'fecha_actualizacion') type = 'TIMESTAMP WITH TIME ZONE';
        if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col === 'peso' || col === 'volume') type = 'NUMERIC DEFAULT 0';
        if (col === 'client_ids') type = 'TEXT[]';
        if (col === 'permissions') type = 'JSONB';
        if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved') || col === 'aceptapolitica' || col === 'aprobada' || col === 'signed') type = 'BOOLEAN DEFAULT FALSE';

        await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (colErr: any) {
        console.error(`[M7-DB-HEAL] Error en tabla ${table} columna ${col}:`, colErr.message);
      }
    }
  }
  console.log('[M7-DB] Curación de Esquema Finalizada.');

  // Harmonización de SERIALs (Garantizar que tablas críticas usen auto-incremento)
  for (const table of serialTables) {
    try {
      const typeCheck = await client.query(`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = 'id'
      `);
      if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type === 'text') {
        console.log(`[M7-DB-HEAL] Convirtiendo ${table}.id de TEXT a INTEGER (Harmonización SERIAL)...`);
        
        // 1. Crear secuencia
        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq`);
        
        // 2. Convertir columna (Intentar preservar numéricos, si no, generar nuevos)
        await client.query(`
          ALTER TABLE ${table} 
          ALTER COLUMN id TYPE INTEGER 
          USING (CASE WHEN id ~ '^[0-9]+$' THEN id::INTEGER ELSE nextval('${table}_id_seq') END)
        `);
        
        // 3. Establecer Default y Vincular Secuencia
        await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq')`);
        await client.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1)`);
        
        console.log(`[M7-DB-HEAL] Tabla ${table} harmonizada exitosamente.`);
      }
    } catch (e: any) {
      console.warn(`[M7-DB-HEAL] Advertencia en harmonización de ${table}:`, e.message);
    }
  }
};

export const restoreSystem = async () => {
  console.log('[M7-SYSTEM] Checking Database Consistency... (Emergency Deploy)');
  const client = await pool.connect();
  try {
    // 1. Curación Inicial (Fuera de transacción para garantizar estructura base)
    await healSchema(client);

    await client.query('BEGIN');
    
    // 2. Restauración de Datos si aplica
    const backupPath = path.join(process.cwd(), 'dist_backend', 'full_restore.sql');
    try {
      if (fs.existsSync(backupPath)) {
        const userCheck = await client.query('SELECT count(*) FROM users');
        if (userCheck.rows[0].count === '0') {
          console.log('[M7-DB] Base de datos vacía. Restaurando desde backup...');
          const sql = fs.readFileSync(backupPath, 'utf8');
          await client.query(sql);
          console.log('[M7-DB] Backup restaurado con éxito.');
        }
      }
    } catch (restoreErr: any) {
      console.error('[M7-DB] Error durante restauración de backup:', restoreErr.message);
    }

    // 3. Re-Curación (Dentro de transacción, por si el backup alteró/borró algo)
    await healSchema(client);

    // 4. Inyección de Datos Críticos
    await client.query(`
      INSERT INTO modules (id, name, icon_class) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
      ('MOD-02', 'GESTIÓN AJOVER', 'Package'),
      ('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES 
      ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS', 'FIRMAS DIGITALES', 'firmas', 'masterPaginas', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS-APR', 'APROBAR FIRMA', 'aprobar-firma', 'masterPaginas', 'MOD-04', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET module_id = EXCLUDED.module_id, parent_id = EXCLUDED.parent_id;
    `);

    // 5. Blindaje de Usuario Administrador
    const adminPass = 'admin123';
    const adminHash = await bcrypt.hash(adminPass, 10);
    console.log('[M7-DB] Generando Hash de Emergencia para admin123...');

    // Limpieza de duplicados/conflictos por email
    await client.query(`
      DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email = 'admin@millasiete.com' AND id != 'USR-01')
    `);
    await client.query(`DELETE FROM users WHERE email = 'admin@millasiete.com' AND id != 'USR-01'`);

    // Forzar USR-01
    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id)
      VALUES ('USR-01', 'admin@millasiete.com', $1, 'SUPER ADMINISTRADOR M7', 'ROL-01', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET password = $1, email = EXCLUDED.email;
    `, [adminHash]);

    // Asegurar permisos full para USR-01
    const allPages = ['PAG-01','PAG-02','PAG-03','PAG-04','PAG-05','PAG-06','PAG-07','PAG-08','PAG-09','PAG-10',
                      'PAG-11','PAG-12','PAG-13','PAG-14','PAG-15','PAG-16','PAG-17','PAG-18','PAG-19','PAG-20',
                      'PAG-21','PAG-22','PAG-FIRMAS','PAG-FIRMAS-APR'];
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
    console.log('[M7-DB] Operación de Sincronización Exitosa.');
    return { success: true, message: 'Sistema Restaurado y Credenciales Dinámicamente Blindadas' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-DB-FATAL] Error en restoreSystem:', err.message);
    throw err;
  } finally {
    client.release();
  }
};
