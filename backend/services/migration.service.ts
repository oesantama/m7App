
import pool from '../config/database.js';

export const restoreSystem = async () => {
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

    // 2. Insertar Módulos
    await client.query(`
      INSERT INTO modules (id, name, icon_class) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
      ('MOD-02', 'GESTIÓN AJOVER', 'Package'),
      ('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 3. Insertar Pestaña WhatsApp
    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET module_id = 'masterWhatsApp', parent_id = 'MOD-04';
    `);

    // 4. Restaurar Permisos Admin
    const allPages = [
        'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
        'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22'
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
