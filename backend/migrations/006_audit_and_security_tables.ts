import { PoolClient } from 'pg';
import { Migration } from './types.js';

export const migration006: Migration = {
  id: '006_audit_and_security_tables',
  name: 'Tabla de auditoría inmutable de ejecución SQL SuperAdmin',
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_superadmin_sql (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT,
        executed_query TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        execution_status TEXT NOT NULL,
        row_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_superadmin_sql_user ON audit_superadmin_sql (user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_superadmin_sql_created ON audit_superadmin_sql (created_at DESC);
    `);
  }
};
