
import pool from '../config/database.js';

export const restoreSystem = async () => {
  console.log('[M7-SYSTEM] Checking Database Consistency... (Emergency Deploy)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. PHASE: UNIVERSAL SCHEMA HEALING
    // Este mapa define todas las columnas obligatorias por tabla para asegurar integridad antes de restaurar o usar el sistema.
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
      'document_items': ['document_id', 'article_id', 'expected_qty', 'count_1', 'count_2', 'order_number', 'unit', 'notes', 'item_status', 'un_code', 'client_ref', 'peso', 'invoice', 'volume', 'city', 'address', 'batch', 'observation', 'received_qty', 'unit_volume', 'neighborhood']
    };

    console.log('[M7-DB] Iniciando Curación de Esquema Universal...');
    for (const [table, columns] of Object.entries(UNIVERSAL_SCHEMA)) {
      // 1.1 Asegurar que la tabla exista (con ID por defecto si no existe)
      await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY)`);
      
      // 1.2 Asegurar cada columna
      for (const col of columns) {
        try {
          // Determinar tipo de dato básico (usamos TEXT por defecto para máxima compatibilidad, 
          // excepto campos conocidos de fecha o número)
          let type = 'TEXT';
          if (col.includes('_at') || col.includes('_date') || col.endsWith('_expiry')) type = 'TIMESTAMP WITH TIME ZONE';
          if (col.includes('qty') || col.includes('count_') || col.includes('capacity') || col.includes('factor') || col === 'peso' || col === 'volume') type = 'NUMERIC DEFAULT 0';
          if (col === 'client_ids') type = 'TEXT[]';
          if (col === 'permissions') type = 'JSONB';
          if (col.includes('enabled') || col.includes('is_active') || col.includes('policy_accepted') || col.includes('approved')) type = 'BOOLEAN DEFAULT FALSE';

          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
        } catch (colErr: any) {
          console.error(`[M7-DB-HEAL] Error en tabla ${table} columna ${col}:`, colErr.message);
        }
      }
    }
    console.log('[M7-DB] Curación de Esquema Universal Finalizada.');

    await client.query(`CREATE SEQUENCE IF NOT EXISTS route_id_seq START 1;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS modules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon_class TEXT,
          status_id TEXT DEFAULT 'EST-01',
          created_by TEXT,
          updated_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          route TEXT,
          module_id TEXT,
          parent_id TEXT,
          status_id TEXT DEFAULT 'EST-01',
          created_by TEXT,
          updated_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS digital_signatures (
          id SERIAL PRIMARY KEY,
          document_number TEXT UNIQUE NOT NULL,
          digital_signature TEXT NOT NULL,
          encrypted_password TEXT NOT NULL,
          policy_accepted BOOLEAN DEFAULT FALSE,
          approved BOOLEAN DEFAULT FALSE,
          approved_at TIMESTAMP WITH TIME ZONE,
          approved_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status_id TEXT DEFAULT 'EST-01',
          created_by TEXT,
          updated_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 0. Tablas Base (Orden Correcto para Foreign Keys)
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        logo_url TEXT,
        status_id TEXT DEFAULT 'EST-01',
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role_id TEXT,
        document_type TEXT,
        document_number TEXT,
        phone TEXT,
        avatar TEXT,
        client_ids TEXT[], 
        status_id TEXT DEFAULT 'EST-01',
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        two_factor_secret TEXT
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        document_type TEXT,
        document_number TEXT,
        phone TEXT,
        client_id TEXT REFERENCES clients(id),
        license_expiry TIMESTAMP WITH TIME ZONE,
        license_pdf TEXT,
        status_id TEXT DEFAULT 'EST-01',
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        plate TEXT UNIQUE NOT NULL,
        brand TEXT,
        owner TEXT,
        capacity_m3 NUMERIC,
        client_id TEXT REFERENCES clients(id),
        soat_expiry TIMESTAMP WITH TIME ZONE,
        techno_expiry TIMESTAMP WITH TIME ZONE,
        soat_pdf TEXT,
        techno_pdf TEXT,
        status_id TEXT DEFAULT 'EST-01',
        model_year TEXT,
        color TEXT,
        vehicle_type TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS master_records (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        notification_email TEXT,
        icon_class TEXT,
        status_id TEXT DEFAULT 'EST-01',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        tipo_notificacion_id TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        client_id TEXT REFERENCES clients(id),
        uom_std TEXT,
        factor_std NUMERIC,
        status_id TEXT DEFAULT 'EST-01',
        barcode TEXT,
        category_articulo_id TEXT,
        factor_inter NUMERIC,
        uom_general_id TEXT,
        uom_inter_id TEXT,
        image_url TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents_l (
        id TEXT PRIMARY KEY,
        external_doc_id TEXT,
        client_id TEXT REFERENCES clients(id),
        vehicle_plate TEXT,
        codplan TEXT,
        delivery_date TIMESTAMP WITH TIME ZONE,
        city TEXT,
        status TEXT DEFAULT 'Pendiente',
        inventory_date TIMESTAMP WITH TIME ZONE,
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
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS updated_by TEXT;
      ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_items (
        id SERIAL PRIMARY KEY,
        document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
        article_id TEXT REFERENCES articles(id),
        expected_qty NUMERIC,
        count_1 NUMERIC DEFAULT 0,
        count_2 NUMERIC DEFAULT 0,
        order_number TEXT,
        unit TEXT,
        notes TEXT,
        item_status TEXT DEFAULT 'PENDIENTE',
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
        neighborhood TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
         id TEXT PRIMARY KEY,
         user_id TEXT REFERENCES users(id),
         permissions JSONB,
         status_id TEXT DEFAULT 'EST-01'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
          id TEXT PRIMARY KEY,
          vehicle_id TEXT REFERENCES vehicles(id),
          driver_id TEXT REFERENCES drivers(id),
          client_id TEXT REFERENCES clients(id),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 1.5 RESTAURACIÓN COMPLETA (OPCIÓN 2 - DEPLOY)
    // Si existe backup completo y la tabla users está vacía (indicador de fresh start)
    const fs = await import('fs');
    const path = await import('path');
    // Ajustar ruta para producción (dist_backend vs src)
    // En Docker: /app/dist_backend/backend/full_restore.sql
    // Pero si compilamos, el .sql debe copiarse. 
    // Por simplicidad, leeremos del source si estamos local o del dist si prod.

    // NOTA: Para que esto funcione en prod, el Dockerfile debe copiar este .sql
    // Fix: __dirname no existe en ESM. Usamos process.cwd() que en Docker es /app
    // El archivo se copia a ./dist_backend/full_restore.sql
    const backupPath = path.join(process.cwd(), 'dist_backend', 'full_restore.sql');

    console.log('[M7-DB] Buscando respaldo en:', backupPath);

    let backupExists = false;
    try {
      await fs.promises.access(backupPath);
      backupExists = true;
    } catch {
      console.log('[M7-DB] No full_restore.sql found, skipping full restore.');
    }

    if (backupExists) {
      let needsRestore = false;
      try {
        const userCheck = await client.query('SELECT count(*) FROM users');
        if (userCheck.rows[0].count === '0') {
          needsRestore = true;
        }
      } catch (err: any) {
        // Si la tabla no existe (Code 42P01), necesitamos restaurar
        if (err.code === '42P01') {
          console.log('[M7-DB] Tabla users no existe. Procediendo a restaurar.');
          needsRestore = true;
        } else {
          console.error('[M7-DB] Error verificando estado de BD:', err);
        }
      }

      if (needsRestore) {
        console.log('[M7-DB] Base de datos vacía o nueva. Ejecutando RESTAURACIÓN COMPLETA...');
        const sql = await fs.promises.readFile(backupPath, 'utf8');
        await client.query(sql);
        console.log('[M7-DB] Restauración completa finalizada.');
        // NO retornamos aquí para permitir que las fases siguientes aseguren permisos y contraseñas
      }
    }

    // 2. Insertar Módulos (Solo si no restauramos backup arriba)
    // Si ya restauramos, los ON CONFLICT DO NOTHING manejarán esto, o podemos saltarlo.
    await client.query(`
      INSERT INTO modules (id, name, icon_class) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
      ('MOD-02', 'GESTIÓN AJOVER', 'Package'),
      ('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 3. Insertar Pestañas de Firma y WhatsApp
    // Limpieza de duplicados previos (PAG-SIG era un ID temporal)
    await client.query(`DELETE FROM pages WHERE id = 'PAG-SIG';`);
    await client.query(`DELETE FROM master_records WHERE id = 'PAG-SIG';`);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES 
      ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS', 'FIRMAS DIGITALES', 'firmas', 'masterPaginas', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS-APR', 'APROBAR FIRMA', 'aprobar-firma', 'masterPaginas', 'MOD-04', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET module_id = EXCLUDED.module_id, parent_id = EXCLUDED.parent_id;
    `);

    // Asegurar en master_records para visibilidad en administradores de maestros
    await client.query(`
      INSERT INTO master_records (id, category, name, parent_id, status_id)
      VALUES 
      ('PAG-FIRMAS', 'masterPaginas', 'FIRMAS DIGITALES', 'MOD-04', 'EST-01'),
      ('PAG-FIRMAS-APR', 'masterPaginas', 'APROBAR FIRMA', 'MOD-04', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET parent_id = EXCLUDED.parent_id;
    `);

    // 4. Restaurar Permisos Admin
    const allPages = [
      'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
      'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22',
      'PAG-FIRMAS', 'PAG-FIRMAS-APR'
    ];

    const perms: any = {
      id: "PERM-USER-USR-01",
      userId: "USR-01",
      statusId: "EST-01"
    };

    allPages.forEach(p => {
      perms[`page_${p}_view`] = true;
      perms[`page_${p}_create`] = true;
      perms[`page_${p}_edit`] = true;
      perms[`page_${p}_delete`] = true;
      perms[`page_${p}_active`] = true;
    });

    await client.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;
    `, ['PERM-USER-USR-01', 'USR-01', JSON.stringify(perms), 'EST-01']);

    // 5. ASEGURAR CONTRASEÑA CIFRADA (EMERGENCY HEALING)
    // El login usa bcrypt. Forzamos admin123 para admin@millasiete.com y USR-01
    const adminHash = '$2b$10$WQwX.iB5U0g9cTrH3F8vBe8HcCo1aMQmyV9p.nDZjjGngew31e.oPO';
    
    // Primero aseguramos que el usuario USR-01 exista con el email correcto
    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, status_id)
      VALUES ('USR-01', 'admin@millasiete.com', $1, 'SUPER ADMINISTRADOR M7', 'ROL-01', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = $1
    `, [adminHash]);

    // También por email por si hay otro ID
    await client.query(`
      UPDATE users SET password = $1 WHERE email = 'admin@millasiete.com'
    `, [adminHash]);

    await client.query('COMMIT');
    return { success: true, message: 'Sistema Restaurado, Datos Sincronizados y Credenciales Blindadas' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
