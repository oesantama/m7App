-- =============================================================================
-- OrbitM7 · Alertas WhatsApp: canal y alcance por destinatario + Facturación Pendiente
-- Equivalente a la migración 010_alertas_destinatarios_alcance.
--
-- Uso:  psql -U m7_admin -d m7_logistica -v ON_ERROR_STOP=1 -f 2026-10_alertas_destinatarios_alcance.sql
--
-- · Idempotente y en una sola transacción.
-- · Registra la migración 010 en _schema_migrations para que el backend no la repita.
-- · NO es obligatorio: si el backend arranca con el código nuevo, aplica la migración solo.
--
-- Qué hace:
--   1. alertas_whatsapp_destinatarios: nombre, canal (WHATSAPP|EMAIL|AMBOS),
--      alcance (GENERAL|CLIENTE), client_ids; el celular pasa a ser opcional.
--      Los destinatarios existentes conservan su comportamiento:
--      sin correo → WHATSAPP; con correo → AMBOS.
--   2. Crea la alerta 'alerta-facturacion-pendiente' (Lun–Sáb 9:00 AM), que reemplaza
--      los crons fijos de las 10:00 AM, con los destinatarios que recibían ese informe:
--        · correos activos de notificaciones TGN-04            → EMAIL, informe general
--        · usuarios cuyos clientes tienen mapeo en prov_cliente → EMAIL, solo sus clientes
-- =============================================================================

BEGIN;

-- Tablas base (ya existen en OrbitM7; se garantizan para entornos nuevos)
CREATE TABLE IF NOT EXISTS alertas_whatsapp (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, phone_numbers TEXT[] DEFAULT '{}',
  message_template TEXT, cron_expression TEXT DEFAULT '0 8 * * 1-5', tipo_evento TEXT DEFAULT 'MANUAL',
  adjunto_tipo TEXT DEFAULT 'ninguno', status_id TEXT DEFAULT 'EST-01', last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ, created_by TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(), client_id TEXT
);
ALTER TABLE alertas_whatsapp ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE TABLE IF NOT EXISTS alertas_whatsapp_destinatarios (
  id SERIAL PRIMARY KEY,
  alerta_id TEXT NOT NULL REFERENCES alertas_whatsapp(id) ON DELETE CASCADE,
  phone_number TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alertas_wa_dest_alerta ON alertas_whatsapp_destinatarios (alerta_id);

-- 1. Nuevas columnas. El canal de los existentes se fija solo la primera vez.
DO $$
DECLARE nueva BOOLEAN;
BEGIN
  nueva := NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'alertas_whatsapp_destinatarios' AND column_name = 'canal');
  ALTER TABLE alertas_whatsapp_destinatarios
    ADD COLUMN IF NOT EXISTS nombre TEXT,
    ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'AMBOS',
    ADD COLUMN IF NOT EXISTS alcance TEXT NOT NULL DEFAULT 'GENERAL',
    ADD COLUMN IF NOT EXISTS client_ids TEXT[] NOT NULL DEFAULT '{}';
  IF nueva THEN
    UPDATE alertas_whatsapp_destinatarios
    SET canal = CASE WHEN COALESCE(TRIM(email), '') = '' THEN 'WHATSAPP' ELSE 'AMBOS' END;
  END IF;
END $$;

ALTER TABLE alertas_whatsapp_destinatarios ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE alertas_whatsapp_destinatarios
  DROP CONSTRAINT IF EXISTS chk_alertas_dest_canal,
  DROP CONSTRAINT IF EXISTS chk_alertas_dest_alcance,
  DROP CONSTRAINT IF EXISTS chk_alertas_dest_contacto;
ALTER TABLE alertas_whatsapp_destinatarios
  ADD CONSTRAINT chk_alertas_dest_canal CHECK (canal IN ('WHATSAPP','EMAIL','AMBOS')),
  ADD CONSTRAINT chk_alertas_dest_alcance CHECK (
    alcance IN ('GENERAL','CLIENTE') AND (alcance = 'GENERAL' OR cardinality(client_ids) > 0)),
  ADD CONSTRAINT chk_alertas_dest_contacto CHECK (
    (canal = 'EMAIL'    OR COALESCE(TRIM(phone_number), '') <> '') AND
    (canal = 'WHATSAPP' OR COALESCE(TRIM(email), '') <> ''));

-- Un celular (o un correo, si no hay celular) no se repite dentro de la misma alerta
ALTER TABLE alertas_whatsapp_destinatarios
  DROP CONSTRAINT IF EXISTS alertas_whatsapp_destinatarios_alerta_id_phone_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_dest_phone
  ON alertas_whatsapp_destinatarios (alerta_id, phone_number)
  WHERE COALESCE(phone_number, '') <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_dest_email
  ON alertas_whatsapp_destinatarios (alerta_id, LOWER(email))
  WHERE COALESCE(phone_number, '') = '' AND email IS NOT NULL;

-- 2. Alerta de Facturación Pendiente y sus destinatarios iniciales (solo si se crea ahora)
DO $$
BEGIN
  INSERT INTO alertas_whatsapp (id, name, description, message_template, cron_expression, tipo_evento,
                                adjunto_tipo, status_id, created_by, updated_by)
  VALUES ('alerta-facturacion-pendiente', 'Facturación Pendiente (9:00 AM)',
          'Manifiestos sin factura. Informe general o filtrado por cliente según cada destinatario.',
          '', '0 9 * * 1-6', 'FACTURACION_PENDIENTE', 'ninguno', 'EST-01', 'SYSTEM', 'SYSTEM')
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN;  -- ya existía: no se tocan sus destinatarios
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificaciones') THEN
    INSERT INTO alertas_whatsapp_destinatarios (alerta_id, nombre, email, canal, alcance, enabled)
    SELECT DISTINCT ON (LOWER(TRIM(n.notification_email)))
           'alerta-facturacion-pendiente', n.name, LOWER(TRIM(n.notification_email)), 'EMAIL', 'GENERAL', true
    FROM notificaciones n
    WHERE n.tipo_notificacion_id = 'TGN-04' AND n.status_id = 'EST-01'
      AND COALESCE(TRIM(n.notification_email), '') <> '';
  END IF;

  WITH mapeados AS (
    SELECT DISTINCT m->>'clientId' AS cid
    FROM prov_cliente p, jsonb_array_elements(COALESCE(p.client_mappings, '[]'::jsonb)) m
    WHERE m->>'clientId' IS NOT NULL
  )
  INSERT INTO alertas_whatsapp_destinatarios (alerta_id, nombre, email, canal, alcance, client_ids, enabled)
  SELECT DISTINCT ON (LOWER(TRIM(u.email)))
         'alerta-facturacion-pendiente', u.name, LOWER(TRIM(u.email)), 'EMAIL', 'CLIENTE',
         ARRAY(SELECT unnest(u.client_ids) INTERSECT SELECT cid FROM mapeados), true
  FROM users u
  WHERE u.status_id = 'EST-01'
    AND COALESCE(TRIM(u.email), '') <> ''
    AND u.email NOT ILIKE '%.local'
    AND u.client_ids && ARRAY(SELECT cid FROM mapeados)
    AND NOT EXISTS (
      SELECT 1 FROM alertas_whatsapp_destinatarios d
      WHERE d.alerta_id = 'alerta-facturacion-pendiente' AND LOWER(d.email) = LOWER(TRIM(u.email)));
END $$;

-- 3. Registrar la migración como aplicada
CREATE TABLE IF NOT EXISTS _schema_migrations (
  id                VARCHAR(255) PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  applied_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INTEGER NOT NULL
);
INSERT INTO _schema_migrations (id, name, execution_time_ms) VALUES
  ('010_alertas_destinatarios_alcance', 'Alertas WhatsApp: canal y alcance por destinatario + alerta de facturación pendiente', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verificación (opcional)
-- SELECT id, name, cron_expression, tipo_evento FROM alertas_whatsapp ORDER BY id;
-- SELECT alerta_id, nombre, phone_number, email, canal, alcance, client_ids FROM alertas_whatsapp_destinatarios ORDER BY alerta_id, id;
