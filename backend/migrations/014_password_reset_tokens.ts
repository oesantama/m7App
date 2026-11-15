import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Recuperación de contraseña real.
 *
 * Antes el correo de "olvidé mi contraseña" enviaba un enlace con token=PENDING y no existía forma de
 * fijar la contraseña nueva. Ahora se guarda un token de un solo uso con vencimiento.
 * Solo se almacena el SHA-256 del token: quien lea la BD no puede usar los enlaces vigentes.
 */
export const migration014: Migration = {
  id: '014_password_reset_tokens',
  name: 'Tokens de un solo uso para recuperación de contraseña',
  up: async (client: PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        requested_ip VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)`);
  },
};
