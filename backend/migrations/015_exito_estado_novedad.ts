import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Estado propio NOVEDAD (Id guía 10) en el tracking hacia Go Éxito.
 *
 * Grupo Éxito pidió (17-nov-2026) que las novedades lleguen con statusName "NOVEDAD" y no como
 * "EN REPARTO" (5) o "RECOGIDO EN TIENDA" (2). Las novedades que dejan la guía viva para un nuevo
 * intento pasan a 10; las que cierran el proceso siguen en 9 (DEVOLUCION) o 7 (CANCELADO).
 */
export const migration015: Migration = {
  id: '015_exito_estado_novedad',
  name: 'Éxito: novedades no definitivas se notifican con estado 10 NOVEDAD',
  up: async (client: PoolClient) => {
    const existe = await client.query(`SELECT to_regclass('public.exito_msj_catalogo_novedades') AS t`);
    if (!existe.rows[0]?.t) return;
    await client.query(`
      UPDATE exito_msj_catalogo_novedades
         SET id_guia_webhook = '10'
       WHERE codigo_novedad IN ('NOV-CLI-AUSENTE', 'NOV-DIR-ERRADA', 'NOV-PORTERIA-NO', 'NOV-DIF-RECOGIDA')
    `);
    await client.query(`ALTER TABLE exito_msj_catalogo_novedades ALTER COLUMN id_guia_webhook SET DEFAULT '10'`);
  },
};
