import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration005: Migration = {
  id: '005_master_seeds_and_modules',
  name: 'Sincronización de catálogos maestros, estados, módulos y permisos',
  up: async (client: PoolClient) => {
    // 1. Estados
    await client.query(`
      INSERT INTO estados (id, name, status_id) VALUES
      ('EST-01', 'ACTIVO',          'EST-01'),
      ('EST-02', 'INACTIVO',        'EST-01'),
      ('EST-03', 'PENDIENTE',       'EST-01'),
      ('EST-04', 'EN CONTEO',       'EST-01'),
      ('EST-05', 'AUDITADO',        'EST-01'),
      ('EST-06', 'RECIBIDO',        'EST-01'),
      ('EST-07', 'COMPLETADO',      'EST-01'),
      ('EST-08', 'INVENTARIADO',    'EST-01'),
      ('EST-09', 'ALISTADO',        'EST-01'),
      ('EST-10', 'ASIGNADO',        'EST-01'),
      ('EST-11', 'EN RUTA',         'EST-01'),
      ('EST-12', 'ENTREGADO',       'EST-01'),
      ('EST-13', 'DEVUELTO',        'EST-01'),
      ('EST-14', 'ENTREGA PARCIAL', 'EST-01'),
      ('EST-15', 'REPICE',         'EST-01'),
      ('EST-16', 'ELIMINADO',       'EST-01'),
      ('EST-17', 'RECHAZADO',       'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Roles
    await client.query(`
      INSERT INTO roles (id, name, status_id) VALUES
      ('ROL-01', 'Super Admin', 'EST-01'), 
      ('ROL-02', 'ADMIN', 'EST-01'), 
      ('ROL-03', 'CONDUCTORES', 'EST-01')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 3. Cliente por defecto
    await client.query(`
      INSERT INTO clients (id, name, status_id, client_type) VALUES
      ('CLI-01', 'Milla 7 Logistics', 'EST-01', 'MUNICIPAL')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. Módulos
    await client.query(`
      INSERT INTO modules (id, name, icon_class, status_id) VALUES
      ('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
      ('MOD-02', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
      ('MOD-03', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
      ('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01'),
      ('MOD-05', 'M7 INTELLIGENCE', 'Sparkles', 'EST-01'),
      ('MOD-06', 'ADMINISTRACIÓN', 'Database', 'EST-01'),
      ('MOD-07', 'GESTIÓN GRUPO INTER', 'Truck', 'EST-01'),
      ('MOD-08', 'CENTRO DE FORMACIÓN', 'Award', 'EST-01'),
      ('MOD-09', 'GESTIÓN HUMANA', 'Users', 'EST-01'),
      ('MOD-10', 'GESTIÓN DOCUMENTOS DRIVE', 'FileText', 'EST-01'),
      ('MOD-11', 'OPERACIÓN ÉXITO', 'Star', 'EST-01'),
      ('MOD-12', 'GERENCIA', 'PieChart', 'EST-01'),
      ('MOD-13', 'OPERACION JHON URIBE', 'Truck', 'EST-01'),
      ('MOD-14', 'HOJAS DE VIDA', 'Users', 'EST-01'),
      ('MOD-15', 'GESTIÓN DICORP', 'FileCheck', 'EST-01'),
      ('MOD-16', 'GESTIÓN BASC', 'Shield', 'EST-01'),
      ('MOD-17', 'GESTIÓN DOCUMENTAL', 'FileText', 'EST-01'),
      ('MOD-18', 'GESTIÓN TI', 'Laptop', 'EST-01')
      ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, 
        icon_class = EXCLUDED.icon_class, 
        status_id = EXCLUDED.status_id;
    `);

    // 5. Misceláneos
    const genericCategories: Record<string, string[]> = {
      'parentescos': ['Hijo/a', 'Padre', 'Madre', 'Cónyuge', 'Hermano/a', 'Otro'],
      'tiempos-libres': ['Estudio', 'Deporte', 'Labores del hogar', 'Recreación', 'Otro'],
      'personas-a-cargo': ['Ninguna', 'de 1 a 3 personas', 'de 4 a 6 personas', 'Mas de 6 personas'],
      'convivientes': ['Cónyuge o pareja', 'Padres', 'Hijos/as', 'Convivientes', 'Vivo solo']
    };

    // Crear tabla si no existe antes de insertar
    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_miscelaneos (
        id SERIAL PRIMARY KEY,
        categoria TEXT NOT NULL,
        nombre TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    for (const [cat, items] of Object.entries(genericCategories)) {
      for (const item of items) {
        await client.query(`
          INSERT INTO gh_miscelaneos (categoria, nombre)
          SELECT $1::TEXT, $2::TEXT
          WHERE NOT EXISTS (SELECT 1 FROM gh_miscelaneos WHERE categoria = $1 AND nombre = $2)
        `, [cat, item]);
      }
    }
  }
};
