-- =============================================================================
-- OrbitM7 · Gestión Humana: Hoja de Vida de Activos + Mensajería
-- Esquema final equivalente a las migraciones 007_gh_activos_mensajeria y 008_gh_maestras_ids.
--
-- Uso:  psql -U m7_admin -d m7_logistica -f 2026-10_gh_activos_mensajeria.sql
--
-- · Idempotente: se puede ejecutar más de una vez sin duplicar ni romper nada.
-- · Todo corre en una transacción: si algo falla, no queda nada a medias.
-- · Al final registra las migraciones 007 y 008 en _schema_migrations, para que el
--   backend no intente aplicarlas de nuevo al arrancar.
--
-- Requisitos (ya existen en OrbitM7): estados, marcas, prov_cliente, gh_areas, gh_personal,
-- pages, roles, role_permissions, documents_l.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Estados nuevos en la maestra global
--    Activos:    EST-24 Operativo · EST-25 En mantenimiento · EST-26 Dañado · EST-27 Dado de baja
--    Mensajería: reutiliza EST-03 Pendiente, EST-10 Asignado, EST-11 En ruta, EST-12 Entregado,
--                EST-13 Devuelto, y agrega EST-28 Fallido · EST-29 Cancelado
-- -----------------------------------------------------------------------------
INSERT INTO estados (id, name, status_id) VALUES
  ('EST-24', 'OPERATIVO',        'EST-01'),
  ('EST-25', 'EN MANTENIMIENTO', 'EST-01'),
  ('EST-26', 'DAÑADO',           'EST-01'),
  ('EST-27', 'DADO DE BAJA',     'EST-01'),
  ('EST-28', 'FALLIDO',          'EST-01'),
  ('EST-29', 'CANCELADO',        'EST-01')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. HOJA DE VIDA DE ACTIVOS
-- -----------------------------------------------------------------------------

-- Tipos de activo (CRUD en Gestión Humana → Misceláneos → Tipos de Activo)
CREATE TABLE IF NOT EXISTS gh_activos_tipos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL UNIQUE,
  estado          VARCHAR(20) NOT NULL DEFAULT 'EST-01',
  usuario_control TEXT,
  fecha_control   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gh_activos_tipos (nombre, usuario_control) VALUES
  ('CÁMARA DE SEGURIDAD', 'SYSTEM'), ('PUERTA / PORTÓN', 'SYSTEM'), ('MONTACARGAS', 'SYSTEM'),
  ('CAMA', 'SYSTEM'), ('IMPRESORA', 'SYSTEM'), ('OTRO', 'SYSTEM')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS gh_activos (
  id                            SERIAL PRIMARY KEY,
  codigo                        VARCHAR(20) NOT NULL UNIQUE,              -- ACT-00001
  tipo_id                       INTEGER NOT NULL REFERENCES gh_activos_tipos(id),
  nombre                        VARCHAR(200) NOT NULL,
  descripcion                   TEXT,
  serial                        VARCHAR(120),
  marca_id                      TEXT REFERENCES marcas(id) ON DELETE SET NULL,
  modelo                        VARCHAR(120),
  ubicacion                     VARCHAR(200),
  area_id                       INTEGER REFERENCES gh_areas(id) ON DELETE SET NULL,
  responsable_id                INTEGER REFERENCES gh_personal(id) ON DELETE SET NULL,
  proveedor_id                  TEXT REFERENCES prov_cliente(documento) ON UPDATE CASCADE ON DELETE SET NULL,
  fecha_adquisicion             DATE,
  costo_inicial                 NUMERIC(15,2) DEFAULT 0,
  estado_id                     TEXT NOT NULL DEFAULT 'EST-24' REFERENCES estados(id),
  criticidad                    VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
  frecuencia_mantenimiento_dias INTEGER,
  proximo_mantenimiento         DATE,
  created_by                    TEXT,
  updated_by                    TEXT,
  created_at                    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at                    TIMESTAMP WITH TIME ZONE,                -- borrado lógico
  CONSTRAINT chk_gh_activos_criticidad CHECK (criticidad IN ('BAJA','MEDIA','ALTA'))
);
CREATE INDEX IF NOT EXISTS idx_gh_activos_tipo        ON gh_activos (tipo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gh_activos_estado_id   ON gh_activos (estado_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gh_activos_responsable ON gh_activos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_gh_activos_created     ON gh_activos (created_at);

-- Hoja de vida: un registro por mantenimiento, gasto, incidencia, cambio, revisión o baja
CREATE TABLE IF NOT EXISTS gh_activos_eventos (
  id                   SERIAL PRIMARY KEY,
  activo_id            INTEGER NOT NULL REFERENCES gh_activos(id) ON DELETE CASCADE,
  tipo_evento          VARCHAR(40) NOT NULL,
  fecha                DATE NOT NULL,
  descripcion          TEXT NOT NULL,
  costo                NUMERIC(15,2) DEFAULT 0,
  proveedor_id         TEXT REFERENCES prov_cliente(documento) ON UPDATE CASCADE ON DELETE SET NULL,
  factura              VARCHAR(100),
  estado_resultante_id TEXT REFERENCES estados(id),
  datos_cambio         JSONB,
  created_by           TEXT,
  created_by_name      TEXT,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_gh_activos_evt_tipo CHECK (tipo_evento IN (
    'MANTENIMIENTO_PREVENTIVO','MANTENIMIENTO_CORRECTIVO','GASTO','INCIDENCIA',
    'CAMBIO_RESPONSABLE','CAMBIO_UBICACION','REVISION','BAJA','REGISTRO'))
);
CREATE INDEX IF NOT EXISTS idx_gh_activos_evt_activo ON gh_activos_eventos (activo_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gh_activos_evt_fecha  ON gh_activos_eventos (fecha);

-- Soportes (fotos/PDF). El archivo vive en Google Drive; aquí solo ruta, hash y metadata.
CREATE TABLE IF NOT EXISTS gh_activos_archivos (
  id              SERIAL PRIMARY KEY,
  activo_id       INTEGER NOT NULL REFERENCES gh_activos(id) ON DELETE CASCADE,
  evento_id       INTEGER REFERENCES gh_activos_eventos(id) ON DELETE CASCADE,
  nombre_original VARCHAR(255),
  mime            VARCHAR(100) NOT NULL,
  tamano_bytes    INTEGER NOT NULL,
  sha256          CHAR(64) NOT NULL,
  drive_path      TEXT NOT NULL,
  local_path      TEXT,                                         -- copia en cola hasta subir a Drive
  estado_subida   VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',     -- PENDIENTE | SUBIDO | ERROR
  reintentos      INTEGER NOT NULL DEFAULT 0,
  ultimo_error    TEXT,
  created_by      TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gh_activos_arch_evento ON gh_activos_archivos (evento_id);
CREATE INDEX IF NOT EXISTS idx_gh_activos_arch_subida ON gh_activos_archivos (estado_subida) WHERE estado_subida <> 'SUBIDO';

-- -----------------------------------------------------------------------------
-- 3. MENSAJERÍA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gh_mensajeria_envios (
  id                     SERIAL PRIMARY KEY,
  tracking               VARCHAR(30) NOT NULL UNIQUE,            -- ENV-AAMMDD-NNNN
  remitente_id           INTEGER NOT NULL REFERENCES gh_personal(id),
  tipo                   VARCHAR(20) NOT NULL DEFAULT 'DOCUMENTO',
  contenido              TEXT NOT NULL,
  cantidad               INTEGER NOT NULL DEFAULT 1,
  peso_kg                NUMERIC(10,2),
  valor_declarado        NUMERIC(15,2),
  prioridad              VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
  destinatario_nombre    VARCHAR(200) NOT NULL,
  destinatario_documento VARCHAR(30),
  destinatario_telefono  VARCHAR(30),
  destinatario_direccion VARCHAR(300) NOT NULL,
  destinatario_ciudad    VARCHAR(100) NOT NULL,
  destinatario_empresa   VARCHAR(200),
  mensajero_id           INTEGER REFERENCES gh_personal(id),
  estado_id              TEXT NOT NULL DEFAULT 'EST-03' REFERENCES estados(id),
  intentos               INTEGER NOT NULL DEFAULT 0,
  fecha_entrega_estimada TIMESTAMP WITH TIME ZONE,
  fecha_asignacion       TIMESTAMP WITH TIME ZONE,
  fecha_recogida         TIMESTAMP WITH TIME ZONE,
  fecha_entrega_real     TIMESTAMP WITH TIME ZONE,
  receptor_nombre        VARCHAR(200),
  receptor_documento     VARCHAR(30),
  observaciones          TEXT,
  created_by             TEXT,
  created_by_name        TEXT,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_gh_msj_tipo      CHECK (tipo IN ('DOCUMENTO','PAQUETE','ENCOMIENDA')),
  CONSTRAINT chk_gh_msj_prioridad CHECK (prioridad IN ('NORMAL','URGENTE')),
  CONSTRAINT chk_gh_msj_estado_id CHECK (estado_id IN ('EST-03','EST-10','EST-11','EST-12','EST-13','EST-28','EST-29'))
);
CREATE INDEX IF NOT EXISTS idx_gh_msj_estado_id          ON gh_mensajeria_envios (estado_id);
CREATE INDEX IF NOT EXISTS idx_gh_msj_mensajero_estado   ON gh_mensajeria_envios (mensajero_id, estado_id);
CREATE INDEX IF NOT EXISTS idx_gh_msj_remitente          ON gh_mensajeria_envios (remitente_id);
CREATE INDEX IF NOT EXISTS idx_gh_msj_created            ON gh_mensajeria_envios (created_at DESC);

-- Trazabilidad (solo inserción): cada cambio de estado con GPS, IP y hora de captura offline
CREATE TABLE IF NOT EXISTS gh_mensajeria_eventos (
  id                 SERIAL PRIMARY KEY,
  envio_id           INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
  estado_anterior_id TEXT REFERENCES estados(id),
  estado_nuevo_id    TEXT NOT NULL REFERENCES estados(id),
  motivo             TEXT,
  lat                NUMERIC(10,7),
  lng                NUMERIC(10,7),
  precision_m        NUMERIC(10,2),
  ip                 VARCHAR(64),
  user_agent         TEXT,
  client_uuid        UUID UNIQUE,                                 -- idempotencia de la app offline
  capturado_at       TIMESTAMP WITH TIME ZONE,                    -- hora en el celular
  user_id            TEXT,
  user_name          TEXT,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gh_msj_evt_envio ON gh_mensajeria_eventos (envio_id, created_at);

-- Firmas y fotos (solo inserción). El archivo vive en Google Drive.
CREATE TABLE IF NOT EXISTS gh_mensajeria_archivos (
  id                 SERIAL PRIMARY KEY,
  envio_id           INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
  evento_id          INTEGER REFERENCES gh_mensajeria_eventos(id) ON DELETE SET NULL,
  tipo               VARCHAR(30) NOT NULL,
  firmante_nombre    VARCHAR(200),
  firmante_documento VARCHAR(30),
  mime               VARCHAR(100) NOT NULL,
  tamano_bytes       INTEGER NOT NULL,
  sha256             CHAR(64) NOT NULL,
  drive_path         TEXT NOT NULL,
  local_path         TEXT,
  estado_subida      VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  reintentos         INTEGER NOT NULL DEFAULT 0,
  ultimo_error       TEXT,
  lat                NUMERIC(10,7),
  lng                NUMERIC(10,7),
  created_by         TEXT,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_gh_msj_arch_tipo CHECK (tipo IN ('FIRMA_MENSAJERO','FIRMA_DESTINATARIO','FOTO_PAQUETE','FOTO_ENTREGA','FOTO_INCIDENCIA'))
);
CREATE INDEX IF NOT EXISTS idx_gh_msj_arch_envio  ON gh_mensajeria_archivos (envio_id);
CREATE INDEX IF NOT EXISTS idx_gh_msj_arch_subida ON gh_mensajeria_archivos (estado_subida) WHERE estado_subida <> 'SUBIDO';

-- Alertas (las genera el cron cada hora)
CREATE TABLE IF NOT EXISTS gh_mensajeria_alertas (
  id          SERIAL PRIMARY KEY,
  envio_id    INTEGER NOT NULL REFERENCES gh_mensajeria_envios(id) ON DELETE CASCADE,
  tipo        VARCHAR(20) NOT NULL,
  detalle     TEXT,
  generada_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  notificada  BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta    BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT chk_gh_msj_alerta_tipo CHECK (tipo IN ('ATRASADO','SIN_ASIGNAR','FALLIDO'))
);
-- Una sola alerta abierta por envío y tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_gh_msj_alerta_abierta ON gh_mensajeria_alertas (envio_id, tipo) WHERE resuelta = FALSE;

-- -----------------------------------------------------------------------------
-- 4. PÁGINAS (sidebar) dentro de Gestión Humana (MOD-09)
-- -----------------------------------------------------------------------------
INSERT INTO pages (id, name, route, module_id, parent_id, status_id) VALUES
  ('PAG-80', 'HOJA DE VIDA ACTIVOS', 'gestion-humana-activos',    'MOD-09', 'MOD-09', 'EST-01'),
  ('PAG-81', 'MENSAJERÍA',           'gestion-humana-mensajeria', 'MOD-09', 'MOD-09', 'EST-01'),
  ('PAG-82', 'MIS ENVÍOS',           'gestion-humana-mis-envios', 'MOD-09', 'MOD-09', 'EST-01')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. PERFIL MENSAJERO (ROL-04): solo ve y opera "Mis Envíos" (PAG-82)
--    Al crear un usuario con este rol, el backend copia estos permisos a user_permissions.
-- -----------------------------------------------------------------------------
INSERT INTO roles (id, name, status_id) VALUES ('ROL-04', 'MENSAJERO', 'EST-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (id, role_id, permissions, status_id, created_by)
VALUES ('RP-ROL-04', 'ROL-04',
        '{"page_PAG-82_view": true, "page_PAG-82_create": true, "page_PAG-82_edit": true}'::jsonb,
        'EST-01', 'SYSTEM')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Recibido de Material: historial del motivo de cambio de estado del Doc L
--    (el backend también la crea al arrancar; se incluye para dejar el esquema completo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_l_status_history (
  id          SERIAL PRIMARY KEY,
  document_id TEXT NOT NULL,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  observacion TEXT,
  user_name   TEXT,
  changed_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_doc_l_status_hist_doc ON document_l_status_history (document_id);

-- -----------------------------------------------------------------------------
-- 7. Registrar las migraciones como aplicadas (evita que el backend las repita)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _schema_migrations (
  id                VARCHAR(255) PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  applied_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INTEGER NOT NULL
);
INSERT INTO _schema_migrations (id, name, execution_time_ms) VALUES
  ('007_gh_activos_mensajeria', 'Gestión Humana: hoja de vida de activos y control de mensajería', 0),
  ('008_gh_maestras_ids',       'Gestión Humana: activos y mensajería referencian maestras por ID', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- -----------------------------------------------------------------------------
-- SELECT id, name, route FROM pages WHERE id IN ('PAG-80','PAG-81','PAG-82');
-- SELECT * FROM roles WHERE id = 'ROL-04';
-- SELECT id, name FROM estados WHERE id BETWEEN 'EST-24' AND 'EST-29' ORDER BY id;
-- SELECT id FROM _schema_migrations ORDER BY id;
