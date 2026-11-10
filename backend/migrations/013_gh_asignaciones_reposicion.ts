import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Asignaciones a personal (GH): reposición del elemento anterior y devoluciones para baja.
 *
 * Problema: al entregar de nuevo un elemento que el colaborador ya tenía (p. ej. dotación), el saldo del
 * colaborador se sumaba sin registrar si devolvió el anterior, e inflaba su inventario.
 *
 *  - gh_asignaciones_personal_detalle.reposicion: qué pasó con el elemento anterior al entregar este
 *    NULL = no tenía saldo | 'BODEGA' devuelve reutilizable | 'BAJA' devuelve deteriorado | 'NO_DEVUELVE'.
 *    cantidad_devuelta / observacion_reposicion completan el registro.
 *  - gh_devoluciones_personal.asignacion_id: devolución creada automáticamente por la reposición de una
 *    asignación (se revierte/anula junto con ella). estado ACTIVA | ANULADA.
 *  - gh_devoluciones_personal_detalle.destino: 'BODEGA' (vuelve a stock) | 'BAJA' (sale del inventario).
 *  - gh_devoluciones_personal_serial: qué seriales exactos devolvió cada devolución.
 */
export const migration013: Migration = {
  id: '013_gh_asignaciones_reposicion',
  name: 'GH asignaciones: reposición del elemento anterior y devoluciones para baja',
  up: async (client: PoolClient) => {
    await client.query(`
      ALTER TABLE gh_asignaciones_personal_detalle
        ADD COLUMN IF NOT EXISTS reposicion VARCHAR(20),
        ADD COLUMN IF NOT EXISTS cantidad_devuelta INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS observacion_reposicion TEXT
    `);
    await client.query(`ALTER TABLE gh_asignaciones_personal_detalle DROP CONSTRAINT IF EXISTS chk_gh_asig_det_reposicion`);
    await client.query(`
      ALTER TABLE gh_asignaciones_personal_detalle
        ADD CONSTRAINT chk_gh_asig_det_reposicion CHECK (reposicion IS NULL OR reposicion IN ('BODEGA', 'BAJA', 'NO_DEVUELVE'))
    `);

    await client.query(`
      ALTER TABLE gh_devoluciones_personal
        ADD COLUMN IF NOT EXISTS asignacion_id INTEGER REFERENCES gh_asignaciones_personal(id),
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_dev_asignacion ON gh_devoluciones_personal (asignacion_id)`);

    await client.query(`
      ALTER TABLE gh_devoluciones_personal_detalle
        ADD COLUMN IF NOT EXISTS destino VARCHAR(20) NOT NULL DEFAULT 'BODEGA'
    `);
    await client.query(`ALTER TABLE gh_devoluciones_personal_detalle DROP CONSTRAINT IF EXISTS chk_gh_dev_det_destino`);
    await client.query(`
      ALTER TABLE gh_devoluciones_personal_detalle
        ADD CONSTRAINT chk_gh_dev_det_destino CHECK (destino IN ('BODEGA', 'BAJA'))
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gh_devoluciones_personal_serial (
        id SERIAL PRIMARY KEY,
        devolucion_id INTEGER NOT NULL REFERENCES gh_devoluciones_personal(id) ON DELETE CASCADE,
        elemento_id INTEGER NOT NULL,
        serial VARCHAR(100) NOT NULL,
        UNIQUE (devolucion_id, serial)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_dev_serial_dev ON gh_devoluciones_personal_serial (devolucion_id)`);

    // Informe de antigüedad: entregas por colaborador/elemento
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gh_asig_personal_fecha ON gh_asignaciones_personal (personal_id, fecha)`);
  },
};
