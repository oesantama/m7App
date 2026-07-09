-- Historial plano de asignaciones Placa × Planilla
-- Un registro por cada cita o despacho asignado a una placa.

CREATE TABLE IF NOT EXISTS dogama_planillas_historial (
  id               SERIAL PRIMARY KEY,
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  vehicle_id       TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  placa            TEXT NOT NULL,
  remesa           TEXT,
  manifiesto       TEXT,
  valor_cxc        NUMERIC(14, 2),
  valor_cxp        NUMERIC(14, 2),
  tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('despacho', 'cita')),
  despacho_id      INT REFERENCES dogama_despachos(id) ON DELETE SET NULL,
  cita_id          INT REFERENCES dogama_citas_recogidas(id) ON DELETE SET NULL,
  usuario_creacion TEXT REFERENCES users(id) ON DELETE SET NULL,
  fecha_creacion   TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

CREATE INDEX IF NOT EXISTS idx_planillas_historial_vehicle  ON dogama_planillas_historial(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_planillas_historial_despacho ON dogama_planillas_historial(despacho_id);
CREATE INDEX IF NOT EXISTS idx_planillas_historial_cita     ON dogama_planillas_historial(cita_id);
CREATE INDEX IF NOT EXISTS idx_planillas_historial_fecha    ON dogama_planillas_historial(fecha);
