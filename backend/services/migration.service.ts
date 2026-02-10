
import pool from '../config/database.js';

export const restoreSystem = async () => {
  console.log('[M7-SYSTEM] Checking Database Consistency... (Emergency Deploy)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Asegurar Tablas Base (Idempotencia)
    await client.query(`
      CREATE TABLE IF NOT EXISTS modules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon_class TEXT,
          status_id TEXT DEFAULT 'EST-01'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          route TEXT,
          module_id TEXT,
          parent_id TEXT REFERENCES modules(id),
          status_id TEXT DEFAULT 'EST-01'
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
          status_id TEXT DEFAULT 'EST-01'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
         id TEXT PRIMARY KEY,
         user_id TEXT REFERENCES users(id),
         permissions TEXT,
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
    const backupPath = path.resolve(__dirname, '../full_restore.sql');

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
        await client.query('COMMIT'); // Commit del restore
        return { success: true, message: 'Base de Datos Clonada de Local' };
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

    await client.query('COMMIT');
    return { success: true, message: 'Sistema Restaurado Exitosamente' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
