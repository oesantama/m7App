import pool from '../config/database.js';
import { Migration, MigrationRecord } from './types.js';
import { migration001 } from './001_baseline_core_schema.js';
import { migration002 } from './002_dispatch_delivery_tables.js';
import { migration003 } from './003_auxiliary_and_gh_tables.js';
import { migration004 } from './004_performance_indexes.js';
import { migration005 } from './005_master_seeds_and_modules.js';
import { migration006 } from './006_audit_and_security_tables.js';
import { migration007 } from './007_gh_activos_mensajeria.js';
import { migration008 } from './008_gh_maestras_ids.js';
import { migration009 } from './009_delivery_returns_optimization.js';
import { migration010 } from './010_alertas_destinatarios_alcance.js';

export const MIGRATIONS_REGISTRY: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010
];

const ADVISORY_LOCK_ID = 742910385;

export interface MigrationRunReport {
  total: number;
  appliedCount: number;
  alreadyAppliedCount: number;
  duration: number;
  appliedIds: string[];
}

export async function runMigrations(): Promise<MigrationRunReport> {
  const start = Date.now();
  const client = await pool.connect();

  try {
    // 1. Bloqueo consultivo de PostgreSQL para concurrencia limpia en cluster/réplicas
    console.log('[M7-MIGRATION] Adquiriendo candado consultivo de base de datos...');
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_ID]);
    const locked = lockResult.rows[0]?.locked;

    if (!locked) {
      console.warn('[M7-MIGRATION] Candado ocupado por otro worker/proceso. Esperando liberación...');
      await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    }

    // 2. Garantizar existencia de tabla inmutable de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER NOT NULL
      );
    `);

    // 3. Consultar migraciones ejecutadas previamente
    const appliedRes = await client.query('SELECT id FROM _schema_migrations');
    const appliedSet = new Set<string>(appliedRes.rows.map((r: any) => r.id));

    const pending = MIGRATIONS_REGISTRY.filter(m => !appliedSet.has(m.id));

    if (pending.length === 0) {
      const duration = Date.now() - start;
      console.log(`[M7-MIGRATION] ✓ Base de datos al día (${appliedSet.size} migraciones activas). Verificado en ${duration}ms (0 bloqueos).`);
      return {
        total: MIGRATIONS_REGISTRY.length,
        appliedCount: 0,
        alreadyAppliedCount: appliedSet.size,
        duration,
        appliedIds: []
      };
    }

    console.log(`[M7-MIGRATION] Detectadas ${pending.length} migraciones pendientes por aplicar.`);
    const newlyApplied: string[] = [];

    // 4. Ejecución atómica y secuencial de cada migración pendiente
    for (const migration of pending) {
      const stepStart = Date.now();
      console.log(`[M7-MIGRATION] Aplicando ${migration.id}: ${migration.name}...`);

      await client.query('BEGIN');
      try {
        await migration.up(client);

        const stepDuration = Date.now() - stepStart;
        await client.query(
          'INSERT INTO _schema_migrations (id, name, execution_time_ms) VALUES ($1, $2, $3)',
          [migration.id, migration.name, stepDuration]
        );

        await client.query('COMMIT');
        newlyApplied.push(migration.id);
        console.log(`[M7-MIGRATION] ✓ ${migration.id} completada con éxito en ${stepDuration}ms.`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[M7-MIGRATION-ERROR] Error al aplicar migración ${migration.id}:`, err.message);
        throw err;
      }
    }

    const totalDuration = Date.now() - start;
    console.log(`[M7-MIGRATION] Secuencia de migraciones finalizada con éxito. ${newlyApplied.length} aplicadas en ${totalDuration}ms.`);

    return {
      total: MIGRATIONS_REGISTRY.length,
      appliedCount: newlyApplied.length,
      alreadyAppliedCount: appliedSet.size,
      duration: totalDuration,
      appliedIds: newlyApplied
    };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch {
      // noop
    }
    client.release();
  }
}

export async function getMigrationStatus(): Promise<{
  applied: MigrationRecord[];
  pending: string[];
  total: number;
}> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER NOT NULL
      );
    `);

    const res = await client.query('SELECT id, name, applied_at, execution_time_ms FROM _schema_migrations ORDER BY id ASC');
    const applied: MigrationRecord[] = res.rows;
    const appliedIds = new Set(applied.map(a => a.id));
    const pending = MIGRATIONS_REGISTRY.filter(m => !appliedIds.has(m.id)).map(m => m.id);

    return {
      applied,
      pending,
      total: MIGRATIONS_REGISTRY.length
    };
  } finally {
    client.release();
  }
}
