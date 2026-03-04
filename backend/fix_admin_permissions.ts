import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});

async function grantAdminPower() {
  console.log('[M7-ADMIN] 🚀 INICIANDO RECONSTRUCCIÓN NUCLEAR DE PERMISOS...');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 0. Registrar Módulo y Página de Grupo Inter si no existen
    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id) 
      VALUES ('MOD-07', 'GESTIÓN GRUPO INTER', 'Truck', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
      VALUES ('PAG-31', 'GESTIÓN OPERATIVA', 'grupo-inter-ops', 'MOD-07', 'MOD-07', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, route = EXCLUDED.route;
    `);

    // 1. Matriz de permisos absoluta
    const actions = ['view', 'create', 'update', 'delete', 'approve', 'execute', 'admin'];
    
    // Buscar todas las páginas para darles poder total
    const pagesRes = await client.query("SELECT id FROM pages");
    const allPageIds = pagesRes.rows.map(r => r.id);
    
    // Agregar IDs virtuales por si no están en la tabla
    if (!allPageIds.includes('PAG-31')) allPageIds.push('PAG-31');
    if (!allPageIds.includes('GRUPO_INTER')) allPageIds.push('GRUPO_INTER');

    const fullPermissionsArray = allPageIds.map(id => ({
        module: id,
        actions: actions
    }));
    fullPermissionsArray.push({ module: 'all', actions: actions });
    const permissionsJson = JSON.stringify(fullPermissionsArray);

    // 2. Formato plano para user_permissions (page_PAG-ID_action)
    const flatPermissions: any = { all: true };
    allPageIds.forEach(id => {
      actions.forEach(act => {
        flatPermissions[`page_${id}_${act}`] = true;
      });
    });

    // 3. RECONSTRUCCIÓN DE USUARIO ADMIN
    const adminEmail = 'admin@millasiete.com';
    const adminPass = await bcrypt.hash('admin123', 10);
    const adminId = 'USR-ADMIN';

    console.log(`[M7-ADMIN] Reconstruyendo usuario: ${adminEmail}`);
    await client.query("DELETE FROM users WHERE email = $1", [adminEmail]);
    await client.query(`
      INSERT INTO users (id, email, password, name, role_id, permissions, status_id)
      VALUES ($1, $2, $3, 'ADMINISTRADOR NÚCLEO', 'ROL-01', $4, 'EST-01')
    `, [adminId, adminEmail, adminPass, permissionsJson]);

    // 4. RECONSTRUCCIÓN DE TABLAS DE APOYO
    await client.query("DELETE FROM role_permissions WHERE role_id = 'ROL-01'");
    await client.query(`
      INSERT INTO role_permissions (id, role_id, permissions, status_id)
      VALUES ('RP-ROL-01', 'ROL-01', $1, 'EST-01')
    `, [permissionsJson]);

    await client.query("DELETE FROM user_permissions WHERE user_id = $1", [adminId]);
    await client.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id)
      VALUES ($1, $2, $3, 'EST-01')
    `, [`UP-${adminId}`, adminId, JSON.stringify(flatPermissions)]);

    await client.query('COMMIT');
    console.log('[M7-ADMIN] ✅ ÉXITO RECONSTRUCCIÓN NUCLEAR COMPLETADA.');
    console.log('[M7-ADMIN] 💡 ACCIONES REQUERIDAS:');
    console.log('    1. Cerrar sesión en la App.');
    console.log('    2. Usar el botón "Reparar Núcleo" en el Login.');
    console.log('    3. Ingresar: admin@millasiete.com / admin123');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[M7-ADMIN] ❌ FALLA EN RECOSTRUCCIÓN:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

grantAdminPower();
