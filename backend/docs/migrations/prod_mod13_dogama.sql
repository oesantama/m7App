-- ============================================================
-- MIGRACIÓN PRODUCCIÓN: MOD-13 OPERACION JHON URIBE (DOGAMA)
-- Ejecutar en el Gestor DB → tab SQL en producción
-- Fecha: 2026-06-13
-- ============================================================

-- 1. MÓDULO
INSERT INTO modules (id, name, icon_class, status_id, created_by, updated_by)
VALUES ('MOD-13', 'OPERACION JHON URIBE', 'Truck', 'EST-01', 'System', 'System')
ON CONFLICT (id) DO NOTHING;

-- 2. PÁGINAS
INSERT INTO pages (id, name, route, module_id, parent_id, status_id, created_by, updated_by)
VALUES
  ('PAG-64', 'MAESTRAS DOGAMA',         'maestras-dogama',       'MOD-13', 'MOD-13', 'EST-01', 'System', 'System'),
  ('PAG-65', 'CITAS, DESPACHO Y CARGA', 'citas-despacho-carga',  'MOD-13', 'MOD-13', 'EST-01', 'System', 'System')
ON CONFLICT (id) DO NOTHING;

-- 3. TABLAS DOGAMA

-- 3a. dogama_marcas
CREATE TABLE IF NOT EXISTS dogama_marcas (
    id              SERIAL PRIMARY KEY,
    descripcion     VARCHAR(255) NOT NULL,
    estado          VARCHAR(50)  DEFAULT 'activo',
    fecha_creacion  TIMESTAMP    DEFAULT now(),
    usuariocreacion VARCHAR(150),
    CONSTRAINT dogama_marcas_descripcion_key UNIQUE (descripcion)
);

-- 3b. dogama_confeccionistas
CREATE TABLE IF NOT EXISTS dogama_confeccionistas (
    id               SERIAL PRIMARY KEY,
    descripcion_conf VARCHAR(255) NOT NULL,
    direccion        VARCHAR(500) NOT NULL,
    ciudad           VARCHAR(100),
    estado           VARCHAR(50)  DEFAULT 'activo',
    usuariocreacion  VARCHAR(150),
    fecha_creacion   TIMESTAMP    DEFAULT now(),
    telefono         VARCHAR(50),
    correo           VARCHAR(150),
    CONSTRAINT dogama_confeccionistas_descripcion_conf_direccion_key UNIQUE (descripcion_conf, direccion)
);

-- 3c. dogama_tipos_prenda
CREATE TABLE IF NOT EXISTS dogama_tipos_prenda (
    id              SERIAL PRIMARY KEY,
    descripcion     VARCHAR(255) NOT NULL,
    estado          VARCHAR(50)  DEFAULT 'activo',
    fecha_creacion  TIMESTAMP    DEFAULT now(),
    usuariocreacion VARCHAR(150),
    CONSTRAINT dogama_tipos_prenda_descripcion_key UNIQUE (descripcion)
);

-- 3d. dogama_tipos_oc
CREATE TABLE IF NOT EXISTS dogama_tipos_oc (
    id              SERIAL PRIMARY KEY,
    descripcion     VARCHAR(200) NOT NULL,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'activo',
    usuariocreacion VARCHAR(100),
    fecha_creacion  TIMESTAMPTZ  DEFAULT now(),
    CONSTRAINT uq_tipo_oc UNIQUE (descripcion)
);

-- 3e. dogama_proveedores
CREATE TABLE IF NOT EXISTS dogama_proveedores (
    id              SERIAL PRIMARY KEY,
    descripcion     VARCHAR(300) NOT NULL,
    estado          VARCHAR(50)  NOT NULL DEFAULT 'activo',
    usuariocreacion VARCHAR(200),
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_prov UNIQUE (descripcion)
);

-- 3f. dogama_email_config
CREATE TABLE IF NOT EXISTS dogama_email_config (
    id              SERIAL PRIMARY KEY,
    provider        VARCHAR(20)  NOT NULL,
    email           VARCHAR(255),
    display_name    VARCHAR(255),
    refresh_token   TEXT,
    access_token    TEXT,
    token_expires_at TIMESTAMP,
    is_active       BOOLEAN      DEFAULT true,
    created_by      VARCHAR(150),
    created_at      TIMESTAMP    DEFAULT now(),
    CONSTRAINT dogama_email_config_provider_key UNIQUE (provider)
);

-- 3g. dogama_despachos
CREATE TABLE IF NOT EXISTS dogama_despachos (
    id                  SERIAL PRIMARY KEY,
    fecha               DATE,
    orden_cargue        VARCHAR(100),
    confeccionista_id   INTEGER REFERENCES dogama_confeccionistas(id) ON DELETE SET NULL,
    confeccionista_txt  VARCHAR(300),
    orden_servicio      VARCHAR(100),
    marca_id            INTEGER REFERENCES dogama_marcas(id) ON DELETE SET NULL,
    marca_txt           VARCHAR(200),
    referencia          VARCHAR(150),
    lote                VARCHAR(150),
    unidades            INTEGER,
    tipo_prenda_id      INTEGER REFERENCES dogama_tipos_prenda(id) ON DELETE SET NULL,
    tipo_prenda_txt     VARCHAR(200),
    estado              VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    usuario_creacion    VARCHAR(200),
    fecha_creacion      TIMESTAMP   NOT NULL DEFAULT now(),
    CONSTRAINT uq_despacho UNIQUE (orden_cargue, orden_servicio, referencia, lote)
);

-- 3h. dogama_citas_recogidas
CREATE TABLE IF NOT EXISTS dogama_citas_recogidas (
    id                 SERIAL PRIMARY KEY,
    fecha              DATE,
    turno              VARCHAR(50),
    hora_inicio        VARCHAR(20),
    hora_fin           VARCHAR(20),
    marca_id           INTEGER REFERENCES dogama_marcas(id) ON DELETE SET NULL,
    marca_txt          VARCHAR(200),
    referencia         VARCHAR(150),
    color              VARCHAR(100),
    lote               VARCHAR(150),
    mesa               INTEGER,
    cantidad           INTEGER,
    proveedor          VARCHAR(300),
    numero_documento   VARCHAR(150),
    tipo_oc            VARCHAR(100),
    estado             VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    usuario_creacion   VARCHAR(200),
    fecha_creacion     TIMESTAMP   NOT NULL DEFAULT now(),
    proveedor_id       INTEGER REFERENCES dogama_confeccionistas(id) ON DELETE SET NULL,
    tipo_oc_id         INTEGER REFERENCES dogama_tipos_oc(id) ON DELETE SET NULL,
    CONSTRAINT uq_cita UNIQUE (numero_documento, referencia, lote, color, mesa)
);

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT 'MÓDULO' AS tipo, id, name FROM modules WHERE id = 'MOD-13'
UNION ALL
SELECT 'PÁGINA', id, name FROM pages WHERE module_id = 'MOD-13'
UNION ALL
SELECT 'TABLA', table_name, 'OK' FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'dogama_%'
ORDER BY 1, 2;
