import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  user: 'm7_admin',
  host: 'localhost',
  database: 'm7_logistica',
  password: 'm7_master_password',
  port: 5432,
});

async function runMigration() {
  try {
    console.log('Conectando a DB...');
    await client.connect();
    
    const sqlPath = path.join(__dirname, 'migration_v2.sql');
    console.log(`Leyendo SQL desde: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Ejecutando migración...');
    await client.query(sql);
    console.log('✅ Migración completada exitosamente.');
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
  } finally {
    await client.end();
  }
}

runMigration();
