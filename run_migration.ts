
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigration = async () => {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'migration_step_1.sql'), 'utf8');
        console.log('Ejecutando migración...');
        await pool.query(sql);
        console.log('Migración completada exitosamente.');
    } catch (error) {
        console.error('Error en migración:', error);
    } finally {
        await pool.end();
    }
};

runMigration();
