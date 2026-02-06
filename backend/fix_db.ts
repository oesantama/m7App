
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@postgres:5432/m7_logistica'
});

const fixDb = async () => {
    try {
        const sqlPath = path.join(__dirname, 'fix_encoding.sql');
        if (!fs.existsSync(sqlPath)) {
            console.error('No se encontró fix_encoding.sql');
            return;
        }
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Aplicando correcciones de encoding y normalización...');
        await pool.query(sql);
        console.log('Correcciones aplicadas exitosamente.');
    } catch (error) {
        console.error('Error al aplicar correcciones:', error);
    } finally {
        await pool.end();
    }
};

fixDb();
