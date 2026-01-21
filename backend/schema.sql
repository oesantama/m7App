
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

-- DATA INICIAL AJOVER S.A.S --
INSERT INTO clients (id, name) VALUES ('c1', 'AJOVER S.A.S');
INSERT INTO users (id, email, password, name, role_id, client_ids) 
VALUES ('USR-01', 'admin@millasiete.com', 'admin123', 'SUPER ADMINISTRADOR M7', 'ROL-01', ARRAY['c1']);

-- Estados iniciales
INSERT INTO master_records (id, category, name) VALUES 
('EST-01', 'masterEstados', 'ACTIVO'),
('EST-02', 'masterEstados', 'INACTIVO');
