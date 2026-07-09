-- ============================================================
-- Dogama: estado_id, ciudad_id and Colombian timezone defaults
-- ============================================================

-- 1. Fix fecha_creacion defaults to use Colombian timezone
ALTER TABLE dogama_marcas          ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_confeccionistas ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_tipos_prenda    ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_tipos_oc        ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_proveedores     ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_despachos       ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
ALTER TABLE dogama_citas_recogidas ALTER COLUMN fecha_creacion SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

-- 2. Add estado_id FK to master tables (estado text column kept for backward compat)
ALTER TABLE dogama_confeccionistas ADD COLUMN IF NOT EXISTS estado_id VARCHAR(20) REFERENCES estados(id) ON DELETE SET NULL;
ALTER TABLE dogama_marcas          ADD COLUMN IF NOT EXISTS estado_id VARCHAR(20) REFERENCES estados(id) ON DELETE SET NULL;
ALTER TABLE dogama_tipos_prenda    ADD COLUMN IF NOT EXISTS estado_id VARCHAR(20) REFERENCES estados(id) ON DELETE SET NULL;
ALTER TABLE dogama_tipos_oc        ADD COLUMN IF NOT EXISTS estado_id VARCHAR(20) REFERENCES estados(id) ON DELETE SET NULL;
ALTER TABLE dogama_proveedores     ADD COLUMN IF NOT EXISTS estado_id VARCHAR(20) REFERENCES estados(id) ON DELETE SET NULL;

-- 3. Add ciudad_id FK to confeccionistas
ALTER TABLE dogama_confeccionistas ADD COLUMN IF NOT EXISTS ciudad_id INT REFERENCES cfg_ciudades(id) ON DELETE SET NULL;

-- 4. Migrate existing estado text → estado_id (EST-01 = activo, EST-02 = inactivo)
UPDATE dogama_confeccionistas SET estado_id = CASE WHEN LOWER(TRIM(estado)) = 'activo' THEN 'EST-01' ELSE 'EST-02' END WHERE estado_id IS NULL AND estado IS NOT NULL;
UPDATE dogama_marcas          SET estado_id = CASE WHEN LOWER(TRIM(estado)) = 'activo' THEN 'EST-01' ELSE 'EST-02' END WHERE estado_id IS NULL AND estado IS NOT NULL;
UPDATE dogama_tipos_prenda    SET estado_id = CASE WHEN LOWER(TRIM(estado)) = 'activo' THEN 'EST-01' ELSE 'EST-02' END WHERE estado_id IS NULL AND estado IS NOT NULL;
UPDATE dogama_tipos_oc        SET estado_id = CASE WHEN LOWER(TRIM(estado)) = 'activo' THEN 'EST-01' ELSE 'EST-02' END WHERE estado_id IS NULL AND estado IS NOT NULL;
UPDATE dogama_proveedores     SET estado_id = CASE WHEN LOWER(TRIM(estado)) = 'activo' THEN 'EST-01' ELSE 'EST-02' END WHERE estado_id IS NULL AND estado IS NOT NULL;

-- 5. Migrate ciudad text → ciudad_id (exact UPPER match)
UPDATE dogama_confeccionistas dc
SET ciudad_id = c.id
FROM cfg_ciudades c
WHERE dc.ciudad_id IS NULL
  AND dc.ciudad IS NOT NULL
  AND dc.ciudad != ''
  AND UPPER(TRIM(dc.ciudad)) = UPPER(TRIM(c.nombre));
