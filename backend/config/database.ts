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

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  // Tamaño del pool: 20 conexiones máx para aguantar carga sin agotar postgres (max_connections=50)
  max: 20,
  min: 2,
  idleTimeoutMillis: 30_000,        // Cierra conexiones ociosas a los 30s
  connectionTimeoutMillis: 5_000,   // Falla rápido si no hay conexión disponible
  // SSL solo en producción (Coolify/DigitalOcean)
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Bogota'");
  console.log('[M7-DB] Cliente conectado y zona horaria establecida a Colombia');
});

pool.on('error', (err) => {
  console.error('[M7-DB] Error inesperado en el cliente de base de datos', err);
});

export default pool;
