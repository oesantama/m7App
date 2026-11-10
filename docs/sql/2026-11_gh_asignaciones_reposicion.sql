-- GH Asignaciones: reposición del elemento anterior y devoluciones para baja
-- Equivalente manual de backend/migrations/013_gh_asignaciones_reposicion.ts (idempotente).

BEGIN;

ALTER TABLE gh_asignaciones_personal_detalle
  ADD COLUMN IF NOT EXISTS reposicion VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cantidad_devuelta INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacion_reposicion TEXT;
ALTER TABLE gh_asignaciones_personal_detalle DROP CONSTRAINT IF EXISTS chk_gh_asig_det_reposicion;
ALTER TABLE gh_asignaciones_personal_detalle
  ADD CONSTRAINT chk_gh_asig_det_reposicion CHECK (reposicion IS NULL OR reposicion IN ('BODEGA', 'BAJA', 'NO_DEVUELVE'));

ALTER TABLE gh_devoluciones_personal
  ADD COLUMN IF NOT EXISTS asignacion_id INTEGER REFERENCES gh_asignaciones_personal(id),
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA';
CREATE INDEX IF NOT EXISTS idx_gh_dev_asignacion ON gh_devoluciones_personal (asignacion_id);

ALTER TABLE gh_devoluciones_personal_detalle
  ADD COLUMN IF NOT EXISTS destino VARCHAR(20) NOT NULL DEFAULT 'BODEGA';
ALTER TABLE gh_devoluciones_personal_detalle DROP CONSTRAINT IF EXISTS chk_gh_dev_det_destino;
ALTER TABLE gh_devoluciones_personal_detalle
  ADD CONSTRAINT chk_gh_dev_det_destino CHECK (destino IN ('BODEGA', 'BAJA'));

CREATE TABLE IF NOT EXISTS gh_devoluciones_personal_serial (
  id SERIAL PRIMARY KEY,
  devolucion_id INTEGER NOT NULL REFERENCES gh_devoluciones_personal(id) ON DELETE CASCADE,
  elemento_id INTEGER NOT NULL,
  serial VARCHAR(100) NOT NULL,
  UNIQUE (devolucion_id, serial)
);
CREATE INDEX IF NOT EXISTS idx_gh_dev_serial_dev ON gh_devoluciones_personal_serial (devolucion_id);

CREATE INDEX IF NOT EXISTS idx_gh_asig_personal_fecha ON gh_asignaciones_personal (personal_id, fecha);

INSERT INTO _schema_migrations (id, name, execution_time_ms)
VALUES ('013_gh_asignaciones_reposicion', 'GH asignaciones: reposición del elemento anterior y devoluciones para baja', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;
