import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Asignaciones a personal (GH): edición y anulación sin perder información.
 *
 *  - gh_asignaciones_personal: estado ACTIVA | ANULADA (nunca se borra un registro) + quién/cuándo/por qué
 *    se anuló o editó por última vez.
 *  - gh_asignaciones_personal_serial: qué seriales exactos entregó cada asignación. Antes solo quedaba el
 *    serial marcado como ASIGNADO a la persona, sin saber de qué asignación venía; sin esto no se puede
 *    revertir con precisión. Se llena para las existentes con la marca de tiempo de la transacción: la
 *    asignación (fecha_control) y sus seriales (fecha_asignacion) se grabaron con el mismo CURRENT_TIMESTAMP.
 *  - gh_asignaciones_personal_historial: cada edición/anulación con la foto completa del antes y el después.
 */
export const migration011: Migration = {
  id: '011_gh_asignaciones_edicion_anulacion',
  name: 'GH asignaciones a personal: edición/anulación con historial y seriales por asignación',
  up: async (client: PoolClient) => {
    await client.query(`
      ALTER TABLE gh_asignaciones_personal
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
        ADD COLUMN IF NOT EXISTS anulada_por TEXT,
        ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
        ADD COLUMN IF NOT EXISTS editada_por TEXT,
        ADD COLUMN IF NOT EXISTS fecha_edicion TIMESTAMP WITH TIME ZONE;
    `);
    await client.query(`ALTER TABLE gh_asignaciones_personal DROP CONSTRAINT IF EXISTS chk_gh_asig_estado`);
    await client.query(`
      ALTER TABLE gh_asignaciones_personal
        ADD CONSTRAINT chk_gh_asig_estado CHECK (estado IN ('ACTIVA', 'ANULADA'))
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_asignaciones_personal_serial (
        id SERIAL PRIMARY KEY,
        asignacion_id INTEGER NOT NULL REFERENCES gh_asignaciones_personal(id) ON DELETE CASCADE,
        elemento_id INTEGER NOT NULL,
        serial TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (asignacion_id, serial)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_asig_serial_asig ON gh_asignaciones_personal_serial (asignacion_id)`);

    // Seriales de las asignaciones existentes (misma transacción ⇒ misma marca de tiempo)
    await client.query(`
      INSERT INTO gh_asignaciones_personal_serial (asignacion_id, elemento_id, serial)
      SELECT a.id, s.elemento_id, s.serial
      FROM gh_asignaciones_personal a
      JOIN gh_asignaciones_personal_detalle d ON d.asignacion_id = a.id
      JOIN gh_inventario_serial_elemento s
        ON s.elemento_id = d.elemento_id
       AND s.personal_id = a.personal_id
       AND s.estado_serial = 'ASIGNADO'
       AND s.fecha_asignacion = a.fecha_control
      ON CONFLICT (asignacion_id, serial) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_asignaciones_personal_historial (
        id SERIAL PRIMARY KEY,
        asignacion_id INTEGER NOT NULL REFERENCES gh_asignaciones_personal(id),
        accion VARCHAR(20) NOT NULL,
        datos_antes JSONB NOT NULL,
        datos_despues JSONB,
        motivo TEXT,
        usuario TEXT,
        fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gh_asig_hist_accion CHECK (accion IN ('EDICION', 'ANULACION'))
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_asig_hist_asig ON gh_asignaciones_personal_historial (asignacion_id, fecha)`);
  }
};
