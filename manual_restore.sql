
-- 1. Limpiar y Restaurar Módulos
DELETE FROM modules WHERE id IN ('MOD-01', 'MOD-02', 'MOD-03', 'MOD-04');
INSERT INTO modules (id, name, icon_class) VALUES
('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
('MOD-02', 'GESTIÓN AJOVER', 'Package'),
('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
('MOD-04', 'SEGURIDAD & ACCESO', 'Shield');

-- 2. Limpiar y Restaurar Páginas
DELETE FROM pages WHERE id LIKE 'PAG-%';
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
('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01');

-- 3. Restaurar Permisos Admin (admin@millasiete.com / USR-01)
DELETE FROM user_permissions WHERE user_id = 'USR-01';
INSERT INTO user_permissions (id, user_id, permissions, status_id) VALUES
('PERM-USER-USR-01', 'USR-01', '{
  "id": "PERM-USER-USR-01",
  "userId": "USR-01",
  "statusId": "EST-01",
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
}', 'EST-01');
