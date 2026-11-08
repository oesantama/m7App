import { Pool, types } from 'pg';
import dotenv from 'dotenv';

// DATE (OID 1082): return raw string "YYYY-MM-DD" to prevent pg from converting
// it to a JS Date object (which serializes as ISO timestamp with UTC offset).
types.setTypeParser(1082, (val: string) => val);
// TIMESTAMP WITHOUT TIME ZONE (OID 1114): return raw string so Colombian local
// times stored in dogama tables are NOT shifted to UTC by the Node.js TZ offset.
// Without this, TZ=America/Bogota causes '12:20:22' → 'T17:20:22Z' in JSON.
types.setTypeParser(1114, (val: string) => val);
// TIMESTAMP WITH TIME ZONE / TIMESTAMPTZ (OID 1184): PostgreSQL con SET TIME ZONE 'America/Bogota'
// entrega 'YYYY-MM-DD HH:mm:ss.sss-05'. Si pg lo convierte a Date, JSON.stringify() llama a .toISOString()
// y lo pasa a UTC (+5h), haciendo que registros creados después de las 7:00 PM en Colombia queden con
// fecha del día siguiente ('...T01:xx:xxZ'). Lo normalizamos a ISO 8601 Colombia ('YYYY-MM-DDTHH:mm:ss-05:00').
types.setTypeParser(1184, (val: string) => {
  if (!val) return val;
  // Ej: "2026-11-05 20:18:44.123456-05" -> "2026-11-05T20:18:44-05:00"
  const m = String(val).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/);
  if (m) {
    return `${m[1]}T${m[2]}${m[3]}:${m[4] || '00'}`;
  }
  return val;
});

dotenv.config();

console.log('[M7-SYSTEM] Inicializando Pool de Base de Datos...');

// Configuración para Docker (prioridad) o Local
const dbUser = process.env.DB_USER || process.env.POSTGRES_USER || 'm7_admin';
const dbPass = process.env.DB_PASS || process.env.POSTGRES_PASSWORD || 'm7_master_password';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbName = process.env.DB_NAME || process.env.POSTGRES_DB || 'm7_logistica';

const connectionString = process.env.DATABASE_URL || `postgres://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

// Con cluster de 2 workers cada uno abre su propio pool.
// 2 workers × 10 conexiones = 20 activas → deja 80 libres en postgres (max_connections=100).
const POOL_SIZE = process.env.NODE_ENV === 'production' ? 10 : 20;

const pool = new Pool({
  connectionString,
  options: '-c timezone=America/Bogota',
  max: POOL_SIZE,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 45_000, // Matar queries después de 45s en lugar de colgar el servidor
  statement_timeout: 45_000,
  // SSL off: PostgreSQL corre en red Docker interna
  ssl: false,
  // Keepalive evita que el firewall de DO corte conexiones inactivas
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Bogota'");
  console.log('[M7-DB] Cliente conectado y zona horaria establecida a Colombia');
});

pool.on('error', (err) => {
  console.error('[M7-DB] Error inesperado en el cliente de base de datos', err);
});

export default pool;
