import { PoolClient } from 'pg';

export interface Migration {
  id: string;              // e.g. '001_baseline_core_schema'
  name: string;            // Descriptive human-readable summary
  up: (client: PoolClient) => Promise<void>;
}

export interface MigrationRecord {
  id: string;
  name: string;
  applied_at: Date;
  execution_time_ms: number;
}
