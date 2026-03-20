-- M7 PRODUCTION MASTER SETUP
-- Script consolidado para preparar la base de datos en un entorno de producción.
-- Incluye todas las correcciones de columnas, llaves primarias y estados.

BEGIN;

-- 1. Extensiones Necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Asegurar campos críticos en documentos_l
ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS inventory_observation TEXT;
ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS plan_type TEXT;
ALTER TABLE documents_l ADD COLUMN IF NOT EXISTS codplan TEXT;

-- 3. Asegurar campos críticos en document_items
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT 'PENDIENTE';
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS un_code TEXT;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS client_ref TEXT;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS peso NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS invoice TEXT DEFAULT 'S/I';
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS order_number TEXT DEFAULT 'S/I';
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 0;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS batch TEXT DEFAULT 'S/L';
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE document_items ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS auto_created BOOLEAN DEFAULT FALSE;

-- 4. Re-estructurar Restricciones de Integridad
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_items_pk_composite') THEN
        ALTER TABLE document_items DROP CONSTRAINT document_items_pk_composite;
    END IF;
END $$;

-- Permitir duplicados controlados por ID de documento, SKU y Factura/Pedido
ALTER TABLE document_items ADD CONSTRAINT document_items_pk_composite UNIQUE (document_id, article_id, invoice, order_number);

-- 5. Tabla de Novedades de Inventario
CREATE TABLE IF NOT EXISTS inventory_news (
    id SERIAL PRIMARY KEY,
    document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
    article_id TEXT,
    quantity NUMERIC DEFAULT 0,
    observation TEXT,
    photo_urls TEXT[],
    user_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Pedidos (Grupo Inter)
CREATE TABLE IF NOT EXISTS grupo_inter_pedidos (
    id SERIAL PRIMARY KEY,
    nro_documento VARCHAR(100),
    cliente VARCHAR(255),
    ciudad_origen VARCHAR(255),
    ciudad_destino VARCHAR(255),
    estado VARCHAR(50) DEFAULT 'Pendiente',
    nro_guia VARCHAR(100),
    fecha_entregado TIMESTAMP,
    placa VARCHAR(50),
    acta_entrega_b64 TEXT,
    producto TEXT,
    cantidad NUMERIC,
    peso NUMERIC,
    valor_flete NUMERIC,
    valor_declarado NUMERIC,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50),
    UNIQUE (nro_documento, producto)
);

-- 6. Tabla de Auditoría y Trazabilidad (M7 Core)
CREATE TABLE IF NOT EXISTS inventory_audit_log (
    id SERIAL PRIMARY KEY,
    document_id TEXT,
    article_id TEXT,
    field_changed TEXT DEFAULT 'count_2',
    old_value NUMERIC,
    new_value NUMERIC,
    reason TEXT,
    auth_code_used TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Sistema de Autorización Remota
CREATE TABLE IF NOT EXISTS auth_codes (
    code TEXT PRIMARY KEY,
    requester_id TEXT,
    approver_contact TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Logs de Seguridad (Forense)
CREATE TABLE IF NOT EXISTS deletion_logs (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    record_data JSONB,
    deleted_by TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Normalización de Estados (Master Data)
INSERT INTO master_records (id, category, name, description, status_id)
VALUES 
('EST-08', 'masterEstados', 'INVENTARIADO', 'Proceso de inventario finalizado', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- 9. Tabla de Rastreo GPS (M7 Intelligence)
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id SERIAL PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    driver_id TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2),
    speed DECIMAL(5, 2),
    heading DECIMAL(5, 2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas de última ubicación
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_vehicle_id ON vehicle_locations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_updated_at ON vehicle_locations(updated_at DESC);

-- Vista para obtener solo la última posición conocida de cada vehículo
CREATE OR REPLACE VIEW v_latest_vehicle_locations AS
SELECT DISTINCT ON (vehicle_id)
    vl.*,
    v.plate
FROM vehicle_locations vl
LEFT JOIN vehicles v ON vl.vehicle_id = v.id
ORDER BY vehicle_id, updated_at DESC;

-- 10. Sistema de Despacho y Firmas
CREATE TABLE IF NOT EXISTS dispatch_assignments (
    id SERIAL PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    helper_ids JSONB DEFAULT '[]',
    scanned_items JSONB DEFAULT '[]',
    is_accompanied BOOLEAN DEFAULT FALSE,
    helper_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PENDING_SIGNATURES',
    created_by TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_signatures_pending (
    id SERIAL PRIMARY KEY,
    dispatch_id INTEGER REFERENCES dispatch_assignments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role_type TEXT,
    signed BOOLEAN DEFAULT FALSE,
    signed_at TIMESTAMP WITH TIME ZONE
);

-- 11. Sistema de Entrega y Devoluciones
CREATE TABLE IF NOT EXISTS delivery_confirmations (
    id SERIAL PRIMARY KEY,
    dispatch_id TEXT,
    invoice_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    vehicle_id TEXT,
    delivery_type TEXT NOT NULL,
    delivered_items JSONB DEFAULT '[]',
    notes TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_returns (
    id SERIAL PRIMARY KEY,
    confirmation_id INTEGER REFERENCES delivery_confirmations(id) ON DELETE SET NULL,
    invoice_id TEXT NOT NULL,
    driver_id TEXT NOT NULL,
    vehicle_id TEXT,
    return_reason TEXT,
    notes TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES delivery_returns(id) ON DELETE CASCADE,
    sku TEXT,
    article_name TEXT,
    quantity_returned INTEGER NOT NULL DEFAULT 0,
    quantity_delivered INTEGER NOT NULL DEFAULT 0,
    unit TEXT,
    notes TEXT
);

-- Saneamiento final
UPDATE document_items SET item_status = 'PENDIENTE' WHERE item_status IS NULL;
UPDATE document_items SET invoice = 'S/I' WHERE invoice IS NULL OR invoice = '';

COMMIT;
