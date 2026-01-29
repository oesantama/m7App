-- Asegurar que las tablas existan (Idempotencia)
CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_class TEXT,
    status_id TEXT DEFAULT 'EST-01'
);

-- Eliminar restricción incorrecta si existe
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_module_id_fkey;

CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    route TEXT,
    module_id TEXT, -- No FK to modules(id) because it uses logical codes like masterWhatsApp
    parent_id TEXT REFERENCES modules(id),
    status_id TEXT DEFAULT 'EST-01'
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status_id TEXT DEFAULT 'EST-01'
);

-- Asegurar que la tabla USERS exista
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertar Usuario Admin (Idempotente)
INSERT INTO users (id, email, password, name, role_id) 
VALUES ('USR-01', 'admin@millasiete.com', 'admin123', 'SUPER ADMINISTRADOR M7', 'ROL-01')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_permissions (
   id TEXT PRIMARY KEY,
   user_id TEXT REFERENCES users(id),
   permissions TEXT, -- JSON String
   status_id TEXT DEFAULT 'EST-01'
);

-- Insertar Datos de Módulos (Idempotente)
INSERT INTO modules (id, name, icon_class) VALUES
('MOD-01', 'CONFIGURACIÓN MAESTROS', 'Settings'),
('MOD-02', 'GESTIÓN AJOVER', 'Package'),
('MOD-03', 'GESTIÓN TRANSPORTE', 'Truck'),
('MOD-04', 'SEGURIDAD & ACCESO', 'Shield')
ON CONFLICT (id) DO NOTHING;

-- Insertar Página Config WhatsApp en SEGURIDAD & ACCESO (MOD-04)
INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
VALUES ('PAG-22', 'CONEXIÓN WHATSAPP', 'whatsapp-status', 'masterWhatsApp', 'MOD-04', 'EST-01')
ON CONFLICT (id) DO UPDATE SET module_id = 'MOD-04', parent_id = 'MOD-04';

-- Actualizar Permisos de Admin
INSERT INTO user_permissions (id, user_id, permissions, status_id)
VALUES 
('PERM-USER-USR-01', 'USR-01', 
 '{"id": "PERM-USER-USR-01", "userId": "USR-01", "statusId": "EST-01", "page_PAG-22_view": true, "page_PAG-22_create": true, "page_PAG-22_edit": true, "page_PAG-22_delete": true, "page_PAG-22_active": true}',
 'EST-01'
)
ON CONFLICT (id) DO UPDATE SET permissions = EXCLUDED.permissions;
