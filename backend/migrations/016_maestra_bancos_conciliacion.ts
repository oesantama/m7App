import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Maestra de bancos para la conciliación de facturas.
 *
 * - Reutiliza la maestra genérica existente: master_records (category = 'bancos'), que ya tiene
 *   id / name / status_id y que usa el módulo de legalizaciones Dicorp. No se crea otra tabla.
 * - invoice_conciliations ya tiene la columna `banco` (antes texto libre, siempre 'Bancolombia'):
 *   desde ahora guarda el ID del banco. Se convierten los nombres existentes a su ID.
 *   Igual para invoice_status_history y invoice_conciliation_reversal_logs (copian ese valor).
 * - route_group_payments no tenía columna de banco: se agrega banco_id solo si no existe.
 * - Página "BANCOS" en Configuración Maestra (MOD-01) para administrar el catálogo.
 */
export const migration016: Migration = {
  id: '016_maestra_bancos_conciliacion',
  name: 'Maestra de bancos (master_records) y banco por conciliación individual/grupal',
  up: async (client: PoolClient) => {
    const existe = async (t: string) =>
      Boolean((await client.query(`SELECT to_regclass($1) AS t`, [`public.${t}`])).rows[0]?.t);

    if (await existe('master_records')) {
      await client.query(`
        INSERT INTO master_records (id, category, name, status_id, created_by) VALUES
          ('BANCO-BANCOLOMBIA',  'bancos', 'BANCOLOMBIA',          'EST-01', 'System'),
          ('BANCO-DAVIVIENDA',   'bancos', 'DAVIVIENDA',           'EST-01', 'System'),
          ('BANCO-DE-BOGOTA',    'bancos', 'BANCO DE BOGOTA',      'EST-01', 'System'),
          ('BANCO-BBVA',         'bancos', 'BBVA',                 'EST-01', 'System'),
          ('BANCO-DE-OCCIDENTE', 'bancos', 'BANCO DE OCCIDENTE',   'EST-01', 'System'),
          ('BANCO-AV-VILLAS',    'bancos', 'BANCO AV VILLAS',      'EST-01', 'System'),
          ('BANCO-CAJA-SOCIAL',  'bancos', 'BANCO CAJA SOCIAL',    'EST-01', 'System'),
          ('BANCO-POPULAR',      'bancos', 'BANCO POPULAR',        'EST-01', 'System'),
          ('BANCO-COLPATRIA',    'bancos', 'SCOTIABANK COLPATRIA', 'EST-01', 'System'),
          ('BANCO-AGRARIO',      'bancos', 'BANCO AGRARIO',        'EST-01', 'System'),
          ('BANCO-NEQUI',        'bancos', 'NEQUI',                'EST-01', 'System'),
          ('BANCO-DAVIPLATA',    'bancos', 'DAVIPLATA',            'EST-01', 'System')
        ON CONFLICT (id) DO NOTHING
      `);

      // Columnas que ya guardaban el banco como texto → pasan a guardar el ID de la maestra
      for (const tabla of ['invoice_conciliations', 'invoice_status_history', 'invoice_conciliation_reversal_logs']) {
        if (!(await existe(tabla))) continue;
        const col = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'banco'`,
          [tabla]
        );
        if (col.rows.length === 0) continue;
        await client.query(`
          UPDATE ${tabla} t
             SET banco = mr.id
            FROM master_records mr
           WHERE mr.category = 'bancos'
             AND t.banco IS NOT NULL AND TRIM(t.banco) <> ''
             AND UPPER(TRIM(t.banco)) = UPPER(mr.name)
        `);
      }
    }

    // Pago grupal de ruta: no tenía banco → banco_id (ID de master_records 'bancos')
    if (await existe('route_group_payments')) {
      await client.query(`ALTER TABLE route_group_payments ADD COLUMN IF NOT EXISTS banco_id TEXT`);
    }

    // Página de administración en Configuración Maestra
    if (await existe('pages')) {
      await client.query(`
        INSERT INTO pages (id, name, route, module_id, parent_id, status_id)
        SELECT CASE WHEN EXISTS (SELECT 1 FROM pages WHERE id = 'PAG-87') THEN 'PAG-BANCOS' ELSE 'PAG-87' END,
               'BANCOS', 'masterBancos', 'MOD-01', 'MOD-01', 'EST-01'
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE route = 'masterBancos')
      `);
    }
  },
};
