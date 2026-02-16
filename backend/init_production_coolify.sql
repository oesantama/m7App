-- ESTRUCTURA INTEGRAL Y SEED DATA MILLA SIETE (M7) - PRODUCCIÓN COOLIFY --

-- 1. CREACIÓN DE TABLAS BASE --

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_class TEXT,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    route TEXT,
    module_id TEXT,
    parent_id TEXT,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT,
    phone TEXT,
    avatar TEXT,
    client_ids TEXT[], 
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret TEXT
);

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

CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    plate TEXT UNIQUE NOT NULL,
    brand TEXT,
    owner TEXT,
    capacity_m3 NUMERIC NOT NULL,
    client_id TEXT REFERENCES clients(id),
    soat_expiry DATE,
    techno_expiry DATE,
    soat_pdf TEXT,
    techno_pdf TEXT,
    status_id TEXT DEFAULT 'EST-01',
    model_year TEXT,
    color TEXT,
    vehicle_type TEXT
);

CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT UNIQUE NOT NULL,
    phone TEXT,
    client_id TEXT REFERENCES clients(id),
    license_expiry DATE,
    license_pdf TEXT,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    client_id TEXT REFERENCES clients(id),
    uom_std TEXT,
    factor_std NUMERIC DEFAULT 1,
    status_id TEXT DEFAULT 'EST-01',
    barcode TEXT,
    category_articulo_id TEXT,
    factor_inter NUMERIC DEFAULT 1,
    uom_general_id TEXT,
    uom_inter_id TEXT,
    uom_std_id TEXT
);

CREATE TABLE IF NOT EXISTS documents_l (
    id TEXT PRIMARY KEY,
    external_doc_id TEXT NOT NULL,
    client_id TEXT REFERENCES clients(id),
    vehicle_plate TEXT,
    codplan TEXT,
    delivery_date DATE,
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
    receiver_user TEXT
);

CREATE TABLE IF NOT EXISTS document_items (
    id SERIAL PRIMARY KEY,
    document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
    article_id TEXT,
    expected_qty NUMERIC NOT NULL,
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

CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT REFERENCES vehicles(id),
    driver_id TEXT REFERENCES drivers(id),
    client_id TEXT REFERENCES clients(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLAS DE PICKING Y AUDITORÍA --

CREATE TABLE IF NOT EXISTS picking_assignments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    leader_id TEXT NOT NULL,
    helper_ids JSONB DEFAULT '[]',
    status TEXT DEFAULT 'IN_PROGRESS', 
    created_by TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS picking_signatures (
    id SERIAL PRIMARY KEY,
    picking_id TEXT REFERENCES picking_assignments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    signed BOOLEAN DEFAULT false,
    signed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(picking_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    permissions JSONB,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT REFERENCES roles(id),
    permissions JSONB,
    status_id TEXT DEFAULT 'EST-01'
);

-- Índices --
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_picking_invoice ON picking_assignments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_picking_status ON picking_assignments(status);

-- 3. SEED DATA (INGESTA DE DATOS) --

-- Roles --
INSERT INTO roles (id, name, status_id) VALUES 
('ROL-01', 'Super Admin', 'EST-01'),
('ROL-02', 'ADMIN', 'EST-01'),
('ROL-03', 'OPERACIONES', 'EST-01')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Módulos --
INSERT INTO modules (id, name, icon_class, status_id) VALUES 
('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings', 'EST-01'),
('MOD-02', 'GESTIÓN AJOVER', 'Package', 'EST-01'),
('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck', 'EST-01'),
('MOD-04', 'SEGURIDAD & ACCESO', 'Shield', 'EST-01'),
('MOD-INT', 'M7 INTELLIGENCE', 'Brain', 'EST-01')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Páginas --
INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES 
('PAG-01', 'ARTÍCULOS', 'master', 'masterArticulo', 'MOD-01', 'EST-01'),
('PAG-03', 'CLIENTES', 'master', 'masterClientes', 'MOD-01', 'EST-01'),
('PAG-04', 'ESTADOS GLOBALES', 'master', 'masterEstados', 'MOD-01', 'EST-01'),
('PAG-09', 'TIPOS DE VEHÍCULO', 'master', 'masterTiposVehiculo', 'MOD-01', 'EST-01'),
('PAG-10', 'UNIDADES DE MEDIDA', 'master', 'masterUnidadMedida', 'MOD-01', 'EST-01'),
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
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Clientes --
INSERT INTO clients (id, name) VALUES ('c1', 'AJOVER S.A.S') ON CONFLICT (id) DO NOTHING;

-- Usuario Admin (admin@millasiete.com / admin123) --
INSERT INTO users (id, email, password, name, role_id, client_ids, status_id) 
VALUES ('USR-01', 'admin@millasiete.com', 'admin123', 'SUPER ADMINISTRADOR M7', 'ROL-01', ARRAY['c1'], 'EST-01') 
ON CONFLICT (id) DO NOTHING;

-- Maestro de Estados --
INSERT INTO master_records (id, category, name, status_id) VALUES 
('EST-01', 'masterEstados', 'ACTIVO', 'EST-01'),
('EST-02', 'masterEstados', 'INACTIVO', 'EST-01'),
('EST-08', 'masterEstados', 'INVENTARIADO', 'EST-01'),
('EST-09', 'masterEstados', 'DISPONIBLE', 'EST-01'),
('EST-10', 'masterEstados', 'ASIGNADO', 'EST-01'),
('EST-11', 'masterEstados', 'EN RUTA', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- Permisos Globales para USR-01 --
INSERT INTO user_permissions (id, user_id, permissions, status_id)
VALUES ('PERM-USER-USR-01', 'USR-01', 
'{"id":"PERM-USER-USR-01","userId":"USR-01","statusId":"EST-01","page_PAG-01_view":true,"page_PAG-03_view":true,"page_PAG-04_view":true,"page_PAG-11_view":true,"page_PAG-12_view":true,"page_PAG-13_view":true,"page_PAG-14_view":true,"page_PAG-15_view":true,"page_PAG-21_view":true,"page_PAG-22_view":true,"page_PAG-01_create":true,"page_PAG-01_edit":true,"page_PAG-01_delete":true,"page_PAG-11_create":true,"page_PAG-11_edit":true,"page_PAG-21_create":true,"page_PAG-21_edit":true,"page_PAG-01_active":true}', 
'EST-01')
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;

-- 4. FINALIZAR --
-- SQL Finalizado para Coolify
