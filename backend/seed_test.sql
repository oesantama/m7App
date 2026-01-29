-- SEEDING SCRIPT FOR M7 APP
-- This script populates the database with test data requested by the user.

-- 1. Roles (Seguridad y Acceso)
INSERT INTO roles (id, name, status_id) VALUES 
('ROL-01', 'SUPERADMIN', 'EST-01'),
('ROL-02', 'ADMIN', 'EST-01'),
('ROL-03', 'OPERACIONES', 'EST-01')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. Clientes (Maestro)
INSERT INTO clients (id, name, status_id) VALUES 
('CLI-TEST-01', 'CLIENTE PRUEBA 1', 'EST-01'),
('CLI-TEST-02', 'CLIENTE PRUEBA 2', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 3. Usuarios
-- Password hash would normally be needed, but assume 'admin123' plain text or simple hash handling in app for now, 
-- or use the one from schema.sql 'admin123'
INSERT INTO users (id, email, password, name, role_id, client_ids, status_id) VALUES 
('USR-SUPER', 'superadmin@millasiete.com', 'admin123', 'SUPER ADMIN', 'ROL-01', ARRAY['CLI-TEST-01', 'CLI-TEST-02'], 'EST-01'),
('USR-ADMIN', 'admin@millasiete.com', 'admin123', 'ADMIN TEST', 'ROL-01', ARRAY['CLI-TEST-01'], 'EST-01')
ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, client_ids = EXCLUDED.client_ids;

-- 4. Módulos
INSERT INTO modules (id, name, icon_class, status_id) VALUES 
('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
('MOD-02', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 5. Páginas
INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES 
('PAG-01', 'ARTÍCULOS', 'master', 'masterArticulo', 'MOD-01', 'EST-01'),
('PAG-02', 'CATEGORÍAS ARTÍCULOS', 'master', 'masterCategorias', 'MOD-01', 'EST-01'),
('PAG-03', 'CLIENTES', 'master', 'masterClientes', 'MOD-01', 'EST-01'),
('PAG-04', 'ESTADOS GLOBALES', 'master', 'masterEstados', 'MOD-01', 'EST-01'),
('PAG-05', 'MARCAS', 'master', 'masterMarcas', 'MOD-01', 'EST-01'),
('PAG-06', 'NOTIFICACIONES', 'master', 'masterNotificaciones', 'MOD-01', 'EST-01'),
('PAG-07', 'TIPOS DOCUMENTO', 'master', 'masterTipoDocumento', 'MOD-01', 'EST-01'),
('PAG-08', 'TIPOS NOTIFICACIÓN', 'master', 'masterTIpoNotificacion', 'MOD-01', 'EST-01'),
('PAG-09', 'TIPOS VEHÍCULO', 'master', 'masterTiposVehiculo', 'MOD-01', 'EST-01'),
('PAG-10', 'UNIDADES MEDIDA', 'master', 'masterUnidadMedida', 'MOD-01', 'EST-01'),
('PAG-11', 'GESTIÓN DOCUMENTOS L', 'documentos', 'gestionDocumentos', 'MOD-02', 'EST-01'),
('PAG-12', 'PLANEAR RUTAS', 'rutas', 'planearRutas', 'MOD-02', 'EST-01'),
('PAG-13', 'RECIBIDO MATERIAL', 'recibido', 'recibidoMaterial', 'MOD-02', 'EST-01'),
('PAG-14', 'FLOTAS & CONDUCTORES', 'flotas', 'flotasConductores', 'MOD-03', 'EST-01'),
('PAG-15', 'VÍNCULO OPERATIVO', 'vinculo', 'vinculoOperativo', 'MOD-03', 'EST-01'),
('PAG-16', 'MÓDULOS SISTEMA', 'master', 'masterModulos', 'MOD-04', 'EST-01'),
('PAG-17', 'PÁGINAS WEB', 'master', 'masterPaginas', 'MOD-04', 'EST-01'),
('PAG-18', 'PERMISOS POR ROL', 'master', 'masterPermisosRol', 'MOD-04', 'EST-01'),
('PAG-19', 'PERMISOS POR USUARIO', 'master', 'masterPermisosUsuario', 'MOD-04', 'EST-01'),
('PAG-20', 'ROLES DE SISTEMA', 'master', 'masterRol', 'MOD-04', 'EST-01'),
('PAG-21', 'USUARIOS', 'master', 'masterUsuarios', 'MOD-04', 'EST-01'),
('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 6. Artículos de Prueba
INSERT INTO articles (id, sku, name, client_id, status_id) VALUES 
('ART-001', 'SKU-001', 'TEJA TRASLUCIDA 3M', 'CLI-TEST-01', 'EST-01'),
('ART-002', 'SKU-002', 'TANQUE 500L', 'CLI-TEST-01', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 7. Vehículos de Prueba
INSERT INTO vehicles (id, plate, capacity_m3, client_id, status_id) VALUES 
('VEH-001', 'ABC-123', 10.5, 'CLI-TEST-01', 'EST-01'),
('VEH-002', 'XYZ-789', 22.0, 'CLI-TEST-01', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 8. Conductores de Prueba
INSERT INTO drivers (id, name, document_number, client_id, status_id) VALUES 
('DRV-001', 'JUAN PÉREZ', '12345678', 'CLI-TEST-01', 'EST-01'),
('DRV-002', 'CARLOS GÓMEZ', '87654321', 'CLI-TEST-01', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 9. Master Records (Estados, Tipos de Vehículo, etc.)
INSERT INTO master_records (id, category, name, status_id) VALUES 
('EST-01', 'masterEstados', 'ACTIVO', 'EST-01'),
('EST-02', 'masterEstados', 'INACTIVO', 'EST-01'),
('TV-01', 'masterTiposVehiculo', 'FURGÓN', 'EST-01'),
('TV-02', 'masterTiposVehiculo', 'CAMIÓN', 'EST-01'),
('UM-01', 'masterUnidadMedida', 'UNIDAD', 'EST-01'),
('UM-02', 'masterUnidadMedida', 'KG', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 10. Permisos (SuperAdmin - Acceso Total)
-- Se construye un JSON con todos los permisos en true
INSERT INTO role_permissions (id, role_id, permissions, status_id) 
VALUES (
  'PERM-ROL-01', 'ROL-01', 
  '{
    "id": "PERM-ROL-01", "roleId": "ROL-01", "statusId": "EST-01",
    "page_PAG-01_view": true, "page_PAG-01_create": true, "page_PAG-01_edit": true, "page_PAG-01_delete": true, "page_PAG-01_active": true,
    "page_PAG-02_view": true, "page_PAG-02_create": true, "page_PAG-02_edit": true, "page_PAG-02_delete": true, "page_PAG-02_active": true,
    "page_PAG-03_view": true, "page_PAG-03_create": true, "page_PAG-03_edit": true, "page_PAG-03_delete": true, "page_PAG-03_active": true,
    "page_PAG-04_view": true, "page_PAG-04_create": true, "page_PAG-04_edit": true, "page_PAG-04_delete": true, "page_PAG-04_active": true,
    "page_PAG-05_view": true, "page_PAG-05_create": true, "page_PAG-05_edit": true, "page_PAG-05_delete": true, "page_PAG-05_active": true,
    "page_PAG-06_view": true, "page_PAG-06_create": true, "page_PAG-06_edit": true, "page_PAG-06_delete": true, "page_PAG-06_active": true,
    "page_PAG-07_view": true, "page_PAG-07_create": true, "page_PAG-07_edit": true, "page_PAG-07_delete": true, "page_PAG-07_active": true,
    "page_PAG-08_view": true, "page_PAG-08_create": true, "page_PAG-08_edit": true, "page_PAG-08_delete": true, "page_PAG-08_active": true,
    "page_PAG-09_view": true, "page_PAG-09_create": true, "page_PAG-09_edit": true, "page_PAG-09_delete": true, "page_PAG-09_active": true,
    "page_PAG-10_view": true, "page_PAG-10_create": true, "page_PAG-10_edit": true, "page_PAG-10_delete": true, "page_PAG-10_active": true,
    "page_PAG-11_view": true, "page_PAG-11_create": true, "page_PAG-11_edit": true, "page_PAG-11_delete": true, "page_PAG-11_active": true,
    "page_PAG-12_view": true, "page_PAG-12_create": true, "page_PAG-12_edit": true, "page_PAG-12_delete": true, "page_PAG-12_active": true,
    "page_PAG-13_view": true, "page_PAG-13_create": true, "page_PAG-13_edit": true, "page_PAG-13_delete": true, "page_PAG-13_active": true,
    "page_PAG-14_view": true, "page_PAG-14_create": true, "page_PAG-14_edit": true, "page_PAG-14_delete": true, "page_PAG-14_active": true,
    "page_PAG-15_view": true, "page_PAG-15_create": true, "page_PAG-15_edit": true, "page_PAG-15_delete": true, "page_PAG-15_active": true,
    "page_PAG-16_view": true, "page_PAG-16_create": true, "page_PAG-16_edit": true, "page_PAG-16_delete": true, "page_PAG-16_active": true,
    "page_PAG-17_view": true, "page_PAG-17_create": true, "page_PAG-17_edit": true, "page_PAG-17_delete": true, "page_PAG-17_active": true,
    "page_PAG-18_view": true, "page_PAG-18_create": true, "page_PAG-18_edit": true, "page_PAG-18_delete": true, "page_PAG-18_active": true,
    "page_PAG-19_view": true, "page_PAG-19_create": true, "page_PAG-19_edit": true, "page_PAG-19_delete": true, "page_PAG-19_active": true,
    "page_PAG-20_view": true, "page_PAG-20_create": true, "page_PAG-20_edit": true, "page_PAG-20_delete": true, "page_PAG-20_active": true,
    "page_PAG-21_view": true, "page_PAG-21_create": true, "page_PAG-21_edit": true, "page_PAG-21_delete": true, "page_PAG-21_active": true,
    "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true
  }',
  'EST-01'
)
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

-- 10.1 Permisos (Admin - ROL-02 - Copia de SuperAdmin por ahora)
INSERT INTO role_permissions (id, role_id, permissions, status_id) 
VALUES (
  'PERM-ROL-02', 'ROL-02', 
  '{
    "id": "PERM-ROL-02", "roleId": "ROL-02", "statusId": "EST-01",
    "page_PAG-01_view": true, "page_PAG-01_create": true, "page_PAG-01_edit": true, "page_PAG-01_delete": true, "page_PAG-01_active": true,
    "page_PAG-02_view": true, "page_PAG-02_create": true, "page_PAG-02_edit": true, "page_PAG-02_delete": true, "page_PAG-02_active": true,
    "page_PAG-03_view": true, "page_PAG-03_create": true, "page_PAG-03_edit": true, "page_PAG-03_delete": true, "page_PAG-03_active": true,
    "page_PAG-04_view": true, "page_PAG-04_create": true, "page_PAG-04_edit": true, "page_PAG-04_delete": true, "page_PAG-04_active": true,
    "page_PAG-05_view": true, "page_PAG-05_create": true, "page_PAG-05_edit": true, "page_PAG-05_delete": true, "page_PAG-05_active": true,
    "page_PAG-06_view": true, "page_PAG-06_create": true, "page_PAG-06_edit": true, "page_PAG-06_delete": true, "page_PAG-06_active": true,
    "page_PAG-07_view": true, "page_PAG-07_create": true, "page_PAG-07_edit": true, "page_PAG-07_delete": true, "page_PAG-07_active": true,
    "page_PAG-08_view": true, "page_PAG-08_create": true, "page_PAG-08_edit": true, "page_PAG-08_delete": true, "page_PAG-08_active": true,
    "page_PAG-09_view": true, "page_PAG-09_create": true, "page_PAG-09_edit": true, "page_PAG-09_delete": true, "page_PAG-09_active": true,
    "page_PAG-10_view": true, "page_PAG-10_create": true, "page_PAG-10_edit": true, "page_PAG-10_delete": true, "page_PAG-10_active": true,
    "page_PAG-11_view": true, "page_PAG-11_create": true, "page_PAG-11_edit": true, "page_PAG-11_delete": true, "page_PAG-11_active": true,
    "page_PAG-12_view": true, "page_PAG-12_create": true, "page_PAG-12_edit": true, "page_PAG-12_delete": true, "page_PAG-12_active": true,
    "page_PAG-13_view": true, "page_PAG-13_create": true, "page_PAG-13_edit": true, "page_PAG-13_delete": true, "page_PAG-13_active": true,
    "page_PAG-14_view": true, "page_PAG-14_create": true, "page_PAG-14_edit": true, "page_PAG-14_delete": true, "page_PAG-14_active": true,
    "page_PAG-15_view": true, "page_PAG-15_create": true, "page_PAG-15_edit": true, "page_PAG-15_delete": true, "page_PAG-15_active": true,
    "page_PAG-16_view": true, "page_PAG-16_create": true, "page_PAG-16_edit": true, "page_PAG-16_delete": true, "page_PAG-16_active": true,
    "page_PAG-17_view": true, "page_PAG-17_create": true, "page_PAG-17_edit": true, "page_PAG-17_delete": true, "page_PAG-17_active": true,
    "page_PAG-18_view": true, "page_PAG-18_create": true, "page_PAG-18_edit": true, "page_PAG-18_delete": true, "page_PAG-18_active": true,
    "page_PAG-19_view": true, "page_PAG-19_create": true, "page_PAG-19_edit": true, "page_PAG-19_delete": true, "page_PAG-19_active": true,
    "page_PAG-20_view": true, "page_PAG-20_create": true, "page_PAG-20_edit": true, "page_PAG-20_delete": true, "page_PAG-20_active": true,
    "page_PAG-21_view": true, "page_PAG-21_create": true, "page_PAG-21_edit": true, "page_PAG-21_delete": true, "page_PAG-21_active": true,
    "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true
  }',
  'EST-01'
)
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

-- 11. Permisos de Usuario Específicos (Explicit Overrides for USR-ADMIN)
INSERT INTO user_permissions (id, user_id, permissions, status_id) 
VALUES (
  'PERM-USR-ADMIN', 'USR-ADMIN', 
  '{
    "id": "PERM-USR-ADMIN", "userId": "USR-ADMIN", "statusId": "EST-01",
    "page_PAG-01_view": true, "page_PAG-01_create": true, "page_PAG-01_edit": true, "page_PAG-01_delete": true, "page_PAG-01_active": true,
    "page_PAG-02_view": true, "page_PAG-02_create": true, "page_PAG-02_edit": true, "page_PAG-02_delete": true, "page_PAG-02_active": true,
    "page_PAG-03_view": true, "page_PAG-03_create": true, "page_PAG-03_edit": true, "page_PAG-03_delete": true, "page_PAG-03_active": true,
    "page_PAG-04_view": true, "page_PAG-04_create": true, "page_PAG-04_edit": true, "page_PAG-04_delete": true, "page_PAG-04_active": true,
    "page_PAG-05_view": true, "page_PAG-05_create": true, "page_PAG-05_edit": true, "page_PAG-05_delete": true, "page_PAG-05_active": true,
    "page_PAG-06_view": true, "page_PAG-06_create": true, "page_PAG-06_edit": true, "page_PAG-06_delete": true, "page_PAG-06_active": true,
    "page_PAG-07_view": true, "page_PAG-07_create": true, "page_PAG-07_edit": true, "page_PAG-07_delete": true, "page_PAG-07_active": true,
    "page_PAG-08_view": true, "page_PAG-08_create": true, "page_PAG-08_edit": true, "page_PAG-08_delete": true, "page_PAG-08_active": true,
    "page_PAG-09_view": true, "page_PAG-09_create": true, "page_PAG-09_edit": true, "page_PAG-09_delete": true, "page_PAG-09_active": true,
    "page_PAG-10_view": true, "page_PAG-10_create": true, "page_PAG-10_edit": true, "page_PAG-10_delete": true, "page_PAG-10_active": true,
    "page_PAG-11_view": true, "page_PAG-11_create": true, "page_PAG-11_edit": true, "page_PAG-11_delete": true, "page_PAG-11_active": true,
    "page_PAG-12_view": true, "page_PAG-12_create": true, "page_PAG-12_edit": true, "page_PAG-12_delete": true, "page_PAG-12_active": true,
    "page_PAG-13_view": true, "page_PAG-13_create": true, "page_PAG-13_edit": true, "page_PAG-13_delete": true, "page_PAG-13_active": true,
    "page_PAG-14_view": true, "page_PAG-14_create": true, "page_PAG-14_edit": true, "page_PAG-14_delete": true, "page_PAG-14_active": true,
    "page_PAG-15_view": true, "page_PAG-15_create": true, "page_PAG-15_edit": true, "page_PAG-15_delete": true, "page_PAG-15_active": true,
    "page_PAG-16_view": true, "page_PAG-16_create": true, "page_PAG-16_edit": true, "page_PAG-16_delete": true, "page_PAG-16_active": true,
    "page_PAG-17_view": true, "page_PAG-17_create": true, "page_PAG-17_edit": true, "page_PAG-17_delete": true, "page_PAG-17_active": true,
    "page_PAG-18_view": true, "page_PAG-18_create": true, "page_PAG-18_edit": true, "page_PAG-18_delete": true, "page_PAG-18_active": true,
    "page_PAG-19_view": true, "page_PAG-19_create": true, "page_PAG-19_edit": true, "page_PAG-19_delete": true, "page_PAG-19_active": true,
    "page_PAG-20_view": true, "page_PAG-20_create": true, "page_PAG-20_edit": true, "page_PAG-20_delete": true, "page_PAG-20_active": true,
    "page_PAG-21_view": true, "page_PAG-21_create": true, "page_PAG-21_edit": true, "page_PAG-21_delete": true, "page_PAG-21_active": true,
    "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true
  }',
  'EST-01'
)
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

