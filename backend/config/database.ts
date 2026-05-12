import { Pool } from 'pg';
import dotenv from 'dotenv';

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
  max: POOL_SIZE,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
