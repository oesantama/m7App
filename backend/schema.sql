
-- ESTRUCTURA INTEGRAL MILLA SIETE (M7) --

-- 1. Tablas Maestras de Configuración
CREATE TABLE master_records (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- masterEstados, masterTiposVehiculo, etc.
    name TEXT NOT NULL,
    description TEXT,
    parent_id TEXT,
    notification_email TEXT,
    icon_class TEXT,
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Clientes
CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Usuarios (Seguridad M7)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT,
    phone TEXT,
    avatar TEXT,
    client_ids TEXT[], -- Array de IDs de clientes permitidos
    status_id TEXT DEFAULT 'EST-01',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Flota y Talento
CREATE TABLE vehicles (
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
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE drivers (
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

-- 5. Operación Logística
CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    client_id TEXT REFERENCES clients(id),
    uom_std TEXT,
    factor_std NUMERIC DEFAULT 1,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE documents_l (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_items (
    id SERIAL PRIMARY KEY,
    document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
    article_id TEXT,
    expected_qty NUMERIC NOT NULL,
    count_1 NUMERIC DEFAULT 0,
    count_2 NUMERIC DEFAULT 0,
    order_number TEXT,
    unit TEXT,
    notes TEXT
);

CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT REFERENCES vehicles(id),
    driver_id TEXT REFERENCES drivers(id),
    client_id TEXT REFERENCES clients(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DATA INICIAL AJOVER S.A.S --
INSERT INTO clients (id, name) VALUES ('c1', 'AJOVER S.A.S');
INSERT INTO users (id, email, password, name, role_id, client_ids) 
VALUES ('USR-01', 'admin@millasiete.com', 'admin123', 'SUPER ADMINISTRADOR M7', 'ROL-01', ARRAY['c1']);

-- Estados iniciales
INSERT INTO master_records (id, category, name) VALUES 
('EST-01', 'masterEstados', 'ACTIVO'),
('EST-02', 'masterEstados', 'INACTIVO');

-- 6. Logs de WhatsApp
CREATE TABLE whatsapp_logs (
    id SERIAL PRIMARY KEY,
    phone_number TEXT NOT NULL,
    message_body TEXT NOT NULL,
    status TEXT DEFAULT 'SENT', -- SENT, DELIVERED, READ, FAILED
    direction TEXT DEFAULT 'OUTBOUND', -- OUTBOUND, INBOUND
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    waha_message_id TEXT,
    error_message TEXT
);


-- 8. Roles y Permisos (Sistema de Seguridad)
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

CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT REFERENCES roles(id),
    permissions JSONB,
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    permissions JSONB,
    status_id TEXT DEFAULT 'EST-01'
);

-- 7. Configuración de Menú WhatsApp (Solo Data)

INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
VALUES ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01')
ON CONFLICT (id) DO UPDATE SET module_id = 'MOD-04', parent_id = 'MOD-04';

-- Actualización de Permisos Admin
INSERT INTO user_permissions (id, user_id, permissions, status_id)
VALUES 
('PERM-USER-USR-01', 'USR-01', 
 '{"id": "PERM-USER-USR-01", "userId": "USR-01", "statusId": "EST-01", "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true}',
 'EST-01'
)
ON CONFLICT (id) DO NOTHING;
