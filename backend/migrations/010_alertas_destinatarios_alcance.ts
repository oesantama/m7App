import { PoolClient } from 'pg';
import { Migration } from './types.js';

/**
 * Alertas WhatsApp → destinatarios con canal y alcance, y Facturación Pendiente como alerta.
 *
 * Cada destinatario (alertas_whatsapp_destinatarios) ahora define:
 *   - nombre:     a quién pertenece el contacto
 *   - canal:      WHATSAPP | EMAIL | AMBOS
 *   - alcance:    GENERAL (informe de todos los clientes) | CLIENTE (solo client_ids)
 *   - client_ids: clientes (maestra `clients`) cuando el alcance es CLIENTE
 *   - phone_number pasa a ser opcional (un destinatario puede ser solo correo)
 *
 * La "Facturación Pendiente" deja de ser un cron fijo en scheduler.service (TGN-04 + usuarios)
 * y pasa a ser la alerta `alerta-facturacion-pendiente` (Lun–Sáb 9:00 AM). Sus destinatarios
 * iniciales replican a quién le llegaba antes:
 *   - correos activos de notificaciones TGN-04            → EMAIL, GENERAL
 *   - usuarios cuyos clientes tienen mapeo en prov_cliente → EMAIL, CLIENTE (esos clientes)
 */
export const migration010: Migration = {
  id: '010_alertas_destinatarios_alcance',
  name: 'Alertas WhatsApp: canal y alcance por destinatario + alerta de facturación pendiente',
  up: async (client: PoolClient) => {
    // Las tablas las crea restoreSystem; se garantizan aquí para entornos nuevos.
    await client.query(`
      CREATE TABLE IF NOT EXISTS alertas_whatsapp (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, phone_numbers TEXT[] DEFAULT '{}',
        message_template TEXT, cron_expression TEXT DEFAULT '0 8 * * 1-5', tipo_evento TEXT DEFAULT 'MANUAL',
        adjunto_tipo TEXT DEFAULT 'ninguno', status_id TEXT DEFAULT 'EST-01', last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ, created_by TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(), client_id TEXT
      );
    `);
    await client.query(`ALTER TABLE alertas_whatsapp ADD COLUMN IF NOT EXISTS client_id TEXT`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS alertas_whatsapp_destinatarios (
        id SERIAL PRIMARY KEY,
        alerta_id TEXT NOT NULL REFERENCES alertas_whatsapp(id) ON DELETE CASCADE,
        phone_number TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alertas_wa_dest_alerta ON alertas_whatsapp_destinatarios (alerta_id)`);

    // ── Nuevas columnas ──
    const nuevaColumna = !(await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'alertas_whatsapp_destinatarios' AND column_name = 'canal'`)).rowCount;
    await client.query(`
      ALTER TABLE alertas_whatsapp_destinatarios
        ADD COLUMN IF NOT EXISTS nombre TEXT,
        ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'AMBOS',
        ADD COLUMN IF NOT EXISTS alcance TEXT NOT NULL DEFAULT 'GENERAL',
        ADD COLUMN IF NOT EXISTS client_ids TEXT[] NOT NULL DEFAULT '{}';
    `);
    await client.query(`ALTER TABLE alertas_whatsapp_destinatarios ALTER COLUMN phone_number DROP NOT NULL`);
    if (nuevaColumna) {
      // Comportamiento anterior: siempre WhatsApp, y además correo si el destinatario lo tenía.
      await client.query(`
        UPDATE alertas_whatsapp_destinatarios
        SET canal = CASE WHEN COALESCE(TRIM(email), '') = '' THEN 'WHATSAPP' ELSE 'AMBOS' END`);
    }

    // ── Reglas ──
    await client.query(`
      ALTER TABLE alertas_whatsapp_destinatarios
        DROP CONSTRAINT IF EXISTS chk_alertas_dest_canal,
        DROP CONSTRAINT IF EXISTS chk_alertas_dest_alcance,
        DROP CONSTRAINT IF EXISTS chk_alertas_dest_contacto;
    `);
    await client.query(`
      ALTER TABLE alertas_whatsapp_destinatarios
        ADD CONSTRAINT chk_alertas_dest_canal CHECK (canal IN ('WHATSAPP','EMAIL','AMBOS')),
        ADD CONSTRAINT chk_alertas_dest_alcance CHECK (
          alcance IN ('GENERAL','CLIENTE') AND (alcance = 'GENERAL' OR cardinality(client_ids) > 0)),
        ADD CONSTRAINT chk_alertas_dest_contacto CHECK (
          (canal = 'EMAIL'    OR COALESCE(TRIM(phone_number), '') <> '') AND
          (canal = 'WHATSAPP' OR COALESCE(TRIM(email), '') <> ''));
    `);

    // Un celular (o un correo, si no hay celular) no se repite dentro de la misma alerta.
    await client.query(`
      ALTER TABLE alertas_whatsapp_destinatarios
        DROP CONSTRAINT IF EXISTS alertas_whatsapp_destinatarios_alerta_id_phone_number_key`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_dest_phone
        ON alertas_whatsapp_destinatarios (alerta_id, phone_number)
        WHERE COALESCE(phone_number, '') <> ''`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_dest_email
        ON alertas_whatsapp_destinatarios (alerta_id, LOWER(email))
        WHERE COALESCE(phone_number, '') = '' AND email IS NOT NULL`);

    // ── Alerta de Facturación Pendiente (antes cron fijo de las 10:00 AM) ──
    const creada = await client.query(`
      INSERT INTO alertas_whatsapp (id, name, description, message_template, cron_expression, tipo_evento,
                                    adjunto_tipo, status_id, created_by, updated_by)
      VALUES ('alerta-facturacion-pendiente', 'Facturación Pendiente (9:00 AM)',
              'Manifiestos sin factura. Informe general o filtrado por cliente según cada destinatario.',
              '', '0 9 * * 1-6', 'FACTURACION_PENDIENTE', 'ninguno', 'EST-01', 'SYSTEM', 'SYSTEM')
      ON CONFLICT (id) DO NOTHING
      RETURNING id`);

    if (creada.rowCount) {
      const hayNotificaciones = (await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'notificaciones'`)).rowCount;
      if (hayNotificaciones) {
        await client.query(`
          INSERT INTO alertas_whatsapp_destinatarios (alerta_id, nombre, email, canal, alcance, enabled)
          SELECT DISTINCT ON (LOWER(TRIM(n.notification_email)))
                 'alerta-facturacion-pendiente', n.name, LOWER(TRIM(n.notification_email)), 'EMAIL', 'GENERAL', true
          FROM notificaciones n
          WHERE n.tipo_notificacion_id = 'TGN-04' AND n.status_id = 'EST-01'
            AND COALESCE(TRIM(n.notification_email), '') <> ''`);
      }
      // Usuarios que recibían el reporte individual: sus clientes con mapeo en prov_cliente.
      await client.query(`
        WITH mapeados AS (
          SELECT DISTINCT m->>'clientId' AS cid
          FROM prov_cliente p, jsonb_array_elements(COALESCE(p.client_mappings, '[]'::jsonb)) m
          WHERE m->>'clientId' IS NOT NULL
        )
        INSERT INTO alertas_whatsapp_destinatarios (alerta_id, nombre, email, canal, alcance, client_ids, enabled)
        SELECT DISTINCT ON (LOWER(TRIM(u.email)))
               'alerta-facturacion-pendiente', u.name, LOWER(TRIM(u.email)), 'EMAIL', 'CLIENTE',
               ARRAY(SELECT unnest(u.client_ids) INTERSECT SELECT cid FROM mapeados), true
        FROM users u
        WHERE u.status_id = 'EST-01'
          AND COALESCE(TRIM(u.email), '') <> ''
          AND u.email NOT ILIKE '%.local'
          AND u.client_ids && ARRAY(SELECT cid FROM mapeados)
          AND NOT EXISTS (
            SELECT 1 FROM alertas_whatsapp_destinatarios d
            WHERE d.alerta_id = 'alerta-facturacion-pendiente' AND LOWER(d.email) = LOWER(TRIM(u.email)))`);
    }
  }
};
