-- =============================================================================
-- SYNC PRODUCCIÓN — OrbitM7 v1.9.56
-- Fecha: 2026-07-07
-- Ejecutar en: orbitm7.m7apps.com (PostgreSQL m7_logistica)
-- Todos los statements son idempotentes (IF NOT EXISTS / IF EXISTS)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLAS DOGAMA — PLANILLAS Y ENCABEZADOS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_enc_planillas_historial (
  id               SERIAL PRIMARY KEY,
  fecha            DATE        NOT NULL DEFAULT CURRENT_DATE,
  vehicle_id       TEXT        NOT NULL,
  conductor_id     TEXT,
  client_id        TEXT,
  remesa           TEXT,
  manifiesto       TEXT,
  valor_cxc        NUMERIC(14,2),
  valor_cxp        NUMERIC(14,2),
  intermediacion   NUMERIC(14,2),
  estado_id        VARCHAR(20) NOT NULL DEFAULT 'EST-01',
  usuario_creacion TEXT,
  fecha_creacion   TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT fk_enc_vehicle    FOREIGN KEY (vehicle_id)       REFERENCES vehicles(id)  ON DELETE SET NULL,
  CONSTRAINT fk_enc_conductor  FOREIGN KEY (conductor_id)     REFERENCES drivers(id)   ON DELETE SET NULL,
  CONSTRAINT fk_enc_client     FOREIGN KEY (client_id)        REFERENCES clients(id)   ON DELETE SET NULL,
  CONSTRAINT fk_enc_usuario    FOREIGN KEY (usuario_creacion) REFERENCES users(id)     ON DELETE SET NULL,
  CONSTRAINT fk_enc_estado     FOREIGN KEY (estado_id)        REFERENCES estados(id)
);

CREATE TABLE IF NOT EXISTS dogama_planillas_audit_log (
  id           SERIAL PRIMARY KEY,
  enc_id       INTEGER,
  planilla_id  INTEGER,
  action_type  VARCHAR(50) NOT NULL,
  user_id      VARCHAR(50),
  user_nombre  VARCHAR(200),
  old_value    JSONB,
  new_value    JSONB,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Columnas nuevas en detalle de planillas
ALTER TABLE dogama_planillas_historial
  ADD COLUMN IF NOT EXISTS confeccionista_id_directo INTEGER,
  ADD COLUMN IF NOT EXISTS cajas            INTEGER,
  ADD COLUMN IF NOT EXISTS tulas            INTEGER,
  ADD COLUMN IF NOT EXISTS canastas         INTEGER,
  ADD COLUMN IF NOT EXISTS costales         INTEGER,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT,
  ADD COLUMN IF NOT EXISTS enc_id           INTEGER REFERENCES dogama_enc_planillas_historial(id),
  ADD COLUMN IF NOT EXISTS estado_id        VARCHAR(20) DEFAULT 'EST-01',
  ADD COLUMN IF NOT EXISTS tipo_cancelacion VARCHAR(20);

ALTER TABLE dogama_planillas_audit_log
  ADD COLUMN IF NOT EXISTS enc_id INTEGER;

ALTER TABLE dogama_tipos_oc
  ADD COLUMN IF NOT EXISTS accion_importacion VARCHAR(20) DEFAULT 'valida';

-- Migración datos: crear enc_id para filas huérfanas (solo si hay pendientes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dogama_planillas_historial WHERE enc_id IS NULL LIMIT 1
  ) THEN
    INSERT INTO dogama_enc_planillas_historial
      (fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
       valor_cxc, valor_cxp, estado_id, usuario_creacion, fecha_creacion)
    SELECT DISTINCT ON (vehicle_id, COALESCE(conductor_id,''), COALESCE(client_id,''), fecha)
           fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
           valor_cxc, valor_cxp,
           CASE WHEN estado = 'cancelado' THEN 'EST-16' ELSE 'EST-01' END,
           usuario_creacion, fecha_creacion
    FROM dogama_planillas_historial
    WHERE enc_id IS NULL
    ORDER BY vehicle_id, COALESCE(conductor_id,''), COALESCE(client_id,''), fecha, fecha_creacion;

    UPDATE dogama_planillas_historial ph
    SET enc_id = enc.id,
        estado_id = CASE WHEN ph.estado = 'cancelado' THEN 'EST-16' ELSE 'EST-01' END
    FROM dogama_enc_planillas_historial enc
    WHERE ph.enc_id IS NULL
      AND enc.vehicle_id = ph.vehicle_id
      AND COALESCE(enc.conductor_id,'') = COALESCE(ph.conductor_id,'')
      AND COALESCE(enc.client_id,'') = COALESCE(ph.client_id,'')
      AND enc.fecha = ph.fecha;
  END IF;
END $$;

-- Eliminar columnas redundantes del detalle (ya migradas al encabezado)
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS fecha CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS vehicle_id CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS conductor_id CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS client_id CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS remesa CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS manifiesto CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS valor_cxc CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS valor_cxp CASCADE;
ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS estado CASCADE;

-- Corregir CHECK constraint de tipo
ALTER TABLE dogama_planillas_historial
  DROP CONSTRAINT IF EXISTS dogama_planillas_historial_tipo_check;
ALTER TABLE dogama_planillas_historial
  ADD CONSTRAINT dogama_planillas_historial_tipo_check
  CHECK (tipo IN ('despacho','cita','material_empaque'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NOTIFICACIONES CORREO CONFECCIONISTAS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_notif_correos (
  id                    SERIAL PRIMARY KEY,
  enc_id                INTEGER REFERENCES dogama_enc_planillas_historial(id) ON DELETE CASCADE,
  confeccionista_id     INTEGER,
  confeccionista_nombre VARCHAR(255),
  confeccionista_email  VARCHAR(150),
  placa                 VARCHAR(20),
  fecha_cita            DATE,
  conductor_nombre      VARCHAR(255),
  ruta_descripcion      TEXT,
  from_email            VARCHAR(150),
  from_provider         VARCHAR(20),
  estado                VARCHAR(30) DEFAULT 'pendiente',
  sent_at               TIMESTAMP,
  created_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  created_by            TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. COLUMNA placa EN flota_tdm_manifiestos
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE flota_tdm_manifiestos
  ADD COLUMN IF NOT EXISTS placa VARCHAR(20);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MAESTRA AUXILIARES DE MESA Y EXTERNOS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_auxiliares_mesa (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(200) NOT NULL,
  estado_id        VARCHAR(20)  NOT NULL DEFAULT 'EST-01',
  usuario_creacion TEXT,
  fecha_creacion   TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT fk_aux_mesa_estado   FOREIGN KEY (estado_id)        REFERENCES estados(id),
  CONSTRAINT fk_aux_mesa_usuario  FOREIGN KEY (usuario_creacion) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dogama_auxiliares_externos (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(200) NOT NULL,
  planilla_historial_id INTEGER REFERENCES dogama_planillas_historial(id) ON DELETE CASCADE,
  usuario_creacion      TEXT,
  fecha_creacion        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT fk_aux_ext_usuario FOREIGN KEY (usuario_creacion) REFERENCES users(id) ON DELETE SET NULL
);

-- Columnas de cargue en detalle de planilla
ALTER TABLE dogama_planillas_historial
  ADD COLUMN IF NOT EXISTS unidades_carge    INTEGER,
  ADD COLUMN IF NOT EXISTS llegada_vh        TIME,
  ADD COLUMN IF NOT EXISTS aux_mesa_id       INTEGER REFERENCES dogama_auxiliares_mesa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cantidad_cargada  INTEGER,
  ADD COLUMN IF NOT EXISTS hora_inicio_carge TIME,
  ADD COLUMN IF NOT EXISTS hora_final_carge  TIME,
  ADD COLUMN IF NOT EXISTS observaciones     TEXT,
  ADD COLUMN IF NOT EXISTS usuario_cargue_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PLANTILLA GLOBAL DE CORREO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_email_template (
  id          SERIAL PRIMARY KEY,
  subject     TEXT NOT NULL DEFAULT 'Notificación de cita de recogida — {{placa}}',
  body        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT,
  updated_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO dogama_email_template (id, subject, body)
SELECT 1,
  'Notificación de cita de recogida — {{placa}}',
  E'Estimado(a) {{confeccionista}},\n\nLe informamos que el vehículo {{placa}} conducido por {{conductor}} (Cédula: {{cedula}} | Cel: {{celular}}) pasará a recoger su mercancía el día {{fecha}}.\n\nLote(s): {{lotes}}\nRemesa: {{remesa}}\n\nGracias por su confianza.\n\nMilla 7 S.A.S.'
WHERE NOT EXISTS (SELECT 1 FROM dogama_email_template);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FLETES E INTERMEDIACIÓN
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_fletes_intermediacion (
  id                          SERIAL PRIMARY KEY,
  empresa                     VARCHAR(255),
  precio_unitario             NUMERIC(14,2),
  flete_minimo                NUMERIC(14,2),
  valor_intermediacion_minimo NUMERIC(14,2),
  flete_maximo                NUMERIC(14,2),
  intermediacion_final        NUMERIC(14,2),
  estado_id                   VARCHAR(10) NOT NULL DEFAULT 'EST-01',
  usuario_creacion            VARCHAR(50),
  fecha_creacion              TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  usuario_actualizacion       VARCHAR(50),
  fecha_actualizacion         TIMESTAMPTZ
);

ALTER TABLE dogama_fletes_intermediacion
  ADD COLUMN IF NOT EXISTS empresa         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(14,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ÓRDENES DE SERVICIO (tabla principal + columnas + índice único)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_ordenes_servicio (
  id                      SERIAL PRIMARY KEY,
  numero_oc               VARCHAR(100) NOT NULL,
  numero_om               VARCHAR(100),
  confeccionista_id       INTEGER,
  tipo_os                 VARCHAR(20) NOT NULL DEFAULT 'ida',
  cantidad                INTEGER NOT NULL DEFAULT 0,
  cantidad_entregada_cedi INTEGER NOT NULL DEFAULT 0,
  precio_unitario         NUMERIC(14,2),
  valor_total             NUMERIC(14,2),
  flete                   NUMERIC(14,2),
  tarifa                  NUMERIC(14,2),
  manifiesto              VARCHAR(100),
  remesa                  VARCHAR(100),
  factura_inicial         VARCHAR(100),
  fecha_factura           DATE,
  estado_id               VARCHAR(20) NOT NULL DEFAULT 'EST-01',
  usuario_creacion        TEXT,
  fecha_creacion          TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  usuario_actualizacion   TEXT,
  fecha_actualizacion     TIMESTAMPTZ,
  CONSTRAINT fk_os_conf   FOREIGN KEY (confeccionista_id) REFERENCES dogama_confeccionistas(id) ON DELETE SET NULL,
  CONSTRAINT fk_os_estado FOREIGN KEY (estado_id)         REFERENCES estados(id)
);

ALTER TABLE dogama_ordenes_servicio
  ADD COLUMN IF NOT EXISTS codigo_sap         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS empresa            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS referencia_antigua VARCHAR(100);

-- Índice único para deduplicación en importación masiva
-- COALESCE maneja NULLs en numero_om (NULL != NULL en índices normales)
CREATE UNIQUE INDEX IF NOT EXISTS uq_os_oc_om_tipo
  ON dogama_ordenes_servicio (numero_oc, COALESCE(numero_om, ''), tipo_os);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RECOGIDAS POR ORDEN DE SERVICIO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dogama_os_recogidas (
  id               SERIAL PRIMARY KEY,
  os_id            INTEGER NOT NULL REFERENCES dogama_ordenes_servicio(id) ON DELETE CASCADE,
  cantidad         INTEGER NOT NULL DEFAULT 0,
  remesa           VARCHAR(100),
  manifiesto       VARCHAR(100),
  codigo_sap       VARCHAR(100),
  flete            NUMERIC(14,2),
  usuario_creacion TEXT,
  fecha_creacion   TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. OTRAS COLUMNAS EN TABLAS GENERALES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_side_a   TEXT,
  ADD COLUMN IF NOT EXISTS license_side_b   TEXT,
  ADD COLUMN IF NOT EXISTS license_category TEXT;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS model_year   TEXT,
  ADD COLUMN IF NOT EXISTS color        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS client_ids         TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS avatar             TEXT,
  ADD COLUMN IF NOT EXISTS document_type      TEXT,
  ADD COLUMN IF NOT EXISTS document_number    TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_by         TEXT,
  ADD COLUMN IF NOT EXISTS updated_by         TEXT;

COMMIT;

-- =============================================================================
-- Verificación — ejecutar después del COMMIT
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM dogama_enc_planillas_historial) AS enc_planillas,
  (SELECT COUNT(*) FROM dogama_auxiliares_mesa)         AS aux_mesa,
  (SELECT COUNT(*) FROM dogama_auxiliares_externos)     AS aux_externos,
  (SELECT COUNT(*) FROM dogama_notif_correos)           AS notif_correos,
  (SELECT COUNT(*) FROM dogama_fletes_intermediacion)   AS fletes,
  (SELECT COUNT(*) FROM dogama_ordenes_servicio)        AS ordenes_servicio,
  (SELECT COUNT(*) FROM dogama_os_recogidas)            AS os_recogidas,
  (SELECT COUNT(*) FROM dogama_email_template)          AS email_template;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'dogama_ordenes_servicio'
  AND indexname = 'uq_os_oc_om_tipo';
