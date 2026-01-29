import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

console.log('[M7-SYSTEM] Inicializando Pool de Base de Datos...');

// Configuración para Docker (prioridad) o Local
const connectionString = process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica';

const pool = new Pool({
  connectionString,
});

pool.on('connect', () => {
  console.log('[M7-DB] Cliente conectado a la base de datos');
});

pool.on('error', (err) => {
  console.error('[M7-DB] Error inesperado en el cliente de base de datos', err);
});

export default pool;
