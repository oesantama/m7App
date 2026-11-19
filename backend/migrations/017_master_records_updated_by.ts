import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * master_records no tenía la columna updated_by, pero saveMasterRecord la escribe:
 * cualquier guardado de la maestra genérica (p. ej. Bancos) fallaba con 500.
 * Se agrega solo si no existe.
 */
export const migration017: Migration = {
  id: '017_master_records_updated_by',
  name: 'master_records: columna updated_by para auditoría de edición',
  up: async (client: PoolClient) => {
    const t = await client.query(`SELECT to_regclass('public.master_records') AS t`);
    if (!t.rows[0]?.t) return;
    await client.query(`ALTER TABLE master_records ADD COLUMN IF NOT EXISTS updated_by TEXT`);
  },
};
