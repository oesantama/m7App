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

-- 4. Re-estructurar Restricciones de Integridad
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_items_pk_composite') THEN
        ALTER TABLE document_items DROP CONSTRAINT document_items_pk_composite;
    END IF;
END $$;

-- Permitir duplicados controlados por ID de documento, SKU y Factura/Pedido
ALTER TABLE document_items ADD CONSTRAINT document_items_pk_composite UNIQUE (document_id, article_id, invoice, order_number);

-- 5. Tabla de Auditoría y Trazabilidad (M7 Core)
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

-- 6. Sistema de Autorización Remota
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

-- Saneamiento inicial de datos huérfanos
UPDATE document_items SET item_status = 'PENDIENTE' WHERE item_status IS NULL;
UPDATE document_items SET invoice = 'S/I' WHERE invoice IS NULL OR invoice = '';

COMMIT;
