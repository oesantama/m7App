
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://m7_user:m7_password@postgres:5432/m7_logistica'
});

async function fixMetadata() {
  try {
    await client.connect();
    console.log('✅ Conectado a la base de datos');

    // 1. CORREGIR ENCODING (Nombres de Módulos y Páginas)
    const encodingFixes = [
      // Módulos
      { query: "UPDATE modules SET name = 'CONFIGURACIÓN MAESTROS' WHERE name LIKE 'CONFIGURACI%' OR id = 'MOD-01'" },
      { query: "UPDATE modules SET name = 'GESTIÓN AJOVER' WHERE name LIKE 'GESTI%' AND name LIKE '%AJOVER%' OR id = 'MOD-02'" },
      { query: "UPDATE modules SET name = 'GESTIÓN TRANSPORTE' WHERE name LIKE 'GESTI%' AND name LIKE '%TRANSPORTE%' OR id = 'MOD-03'" },
      // Páginas
      { query: "UPDATE pages SET name = 'CATEGORÍAS DE ARTÍCULO' WHERE id = 'PAG-02'" },
      { query: "UPDATE pages SET name = 'TIPOS DE DOCUMENTO' WHERE id = 'PAG-07'" },
      { query: "UPDATE pages SET name = 'TIPOS DE VEHÍCULO' WHERE id = 'PAG-09'" },
      { query: "UPDATE pages SET name = 'UNIDADES DE MEDIDA' WHERE id = 'PAG-10'" },
      { query: "UPDATE pages SET name = 'GESTIÓN DOCUMENTOS L' WHERE id = 'PAG-11'" },
      { query: "UPDATE pages SET name = 'VÍNCULO OPERATIVO' WHERE id = 'PAG-15'" },
      { query: "UPDATE pages SET name = 'MÓDULOS SISTEMA' WHERE id = 'PAG-16'" },
      { query: "UPDATE pages SET name = 'PÁGINAS WEB' WHERE id = 'PAG-17'" },
      { query: "UPDATE pages SET name = 'CONEXIÓN WHATSAPP' WHERE id = 'PAG-22'" },
      // Estados
      { query: "UPDATE master_records SET name = 'DEVOLUCIÓN' WHERE id = 'EST-07' AND category = 'masterEstados'" },
      { query: "UPDATE master_records SET name = 'INVENTARIADO' WHERE id = 'EST-08' AND category = 'masterEstados'" },
      { query: "UPDATE master_records SET name = 'FURGÓN' WHERE id = 'TV-01' AND category = 'masterTiposVehiculo'" },
      { query: "UPDATE master_records SET name = 'CAMIÓN' WHERE id = 'TV-02' AND category = 'masterTiposVehiculo'" },
    ];

    console.log('🛠️  Aplicando correcciones de encoding...');
    for (const fix of encodingFixes) {
      await client.query(fix.query);
    }
    // 3. INSERTAR MÓDULOS DE INNOVACIÓN (Si no existen)
    console.log('🚀 Insertando módulos de innovación...');
    
    // Gamificación (Para Conductores)
    await client.query(`
      INSERT INTO pages (id, name, route, module_id, status_id) 
      VALUES ('PAG-GAM-01', 'MIS LOGROS', 'gamification', 'MOD-03', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Dashboard Ejecutivo (Para Admins - Nuevo Módulo de Inteligencia)
    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id)
      VALUES ('MOD-INT', 'M7 INTELLIGENCE', 'Brain', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO pages (id, name, route, module_id, status_id)
      VALUES 
      ('PAG-EXEC-01', 'DASHBOARD EJECUTIVO', 'executive-dashboard', 'MOD-INT', 'EST-01'),
      ('PAG-CHAT-01', 'ASISTENTE IA', 'chatbot', 'MOD-INT', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Actualizar permisos del SuperAdmin para ver estos nuevos módulos
    // Obtenemos el JSON actual, lo parseamos, agregamos las flags y lo guardamos
    const resPerms = await client.query("SELECT permissions FROM user_permissions WHERE user_id = 'USR-01'");
    if (resPerms.rows.length > 0) {
      let p = resPerms.rows[0].permissions;
      if (typeof p === 'string') p = JSON.parse(p);
      
      p['page_PAG-GAM-01_view'] = true;
      p['page_PAG-EXEC-01_view'] = true;
      p['page_PAG-CHAT-01_view'] = true;
      
      // También activemos create/edit/delete por si acaso
      ['PAG-GAM-01', 'PAG-EXEC-01', 'PAG-CHAT-01'].forEach(pag => {
        p[`page_${pag}_create`] = true;
        p[`page_${pag}_edit`] = true;
        p[`page_${pag}_delete`] = true;
        p[`page_${pag}_active`] = true;
      });

      await client.query("UPDATE user_permissions SET permissions = $1 WHERE user_id = 'USR-01'", [JSON.stringify(p)]);
      console.log('✅ Permisos de SuperAdmin actualizados con nuevas páginas');
    }

    console.log('✅ Encoding y Módulos corregidos');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.end();
  }
}

fixMetadata();
