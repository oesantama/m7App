-- Fix 1: Fix existing records with UTC timestamps (subtract 5 hours to get Colombian local time)
-- All records inserted before the timezone migration had DEFAULT = NOW() (UTC)
UPDATE dogama_confeccionistas SET fecha_creacion = fecha_creacion - INTERVAL '5 hours';
UPDATE dogama_tipos_prenda    SET fecha_creacion = fecha_creacion - INTERVAL '5 hours';
UPDATE dogama_proveedores     SET fecha_creacion = fecha_creacion - INTERVAL '5 hours';
-- dogama_marcas already re-imported with correct Colombian time, skip
-- dogama_tipos_oc is TIMESTAMPTZ, change to WITHOUT TZ and fix
ALTER TABLE dogama_tipos_oc ALTER COLUMN fecha_creacion TYPE TIMESTAMP WITHOUT TIME ZONE
  USING (fecha_creacion AT TIME ZONE 'UTC') - INTERVAL '5 hours';

-- Fix 2: despachos and citas also need to store Colombian time in their fecha_creacion
UPDATE dogama_despachos       SET fecha_creacion = fecha_creacion - INTERVAL '5 hours' WHERE fecha_creacion > '2026-01-01';
UPDATE dogama_citas_recogidas SET fecha_creacion = fecha_creacion - INTERVAL '5 hours' WHERE fecha_creacion > '2026-01-01';
