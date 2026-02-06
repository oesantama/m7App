import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedPath = path.join(__dirname, 'backend', 'seed_marcas.sql');
const sql = fs.readFileSync(seedPath, 'utf8');

const connectionString = 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica';
const pool = new Pool({ connectionString });

console.log('[M7-SEED] Ejecutando seed de marcas...');

pool.query(sql)
  .then(() => {
    console.log('[M7-SEED] Seed completado con éxito.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[M7-SEED] Error ejecutando seed:', err);
    process.exit(1);
  });
