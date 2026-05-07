import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbUser = process.env.DB_USER || process.env.POSTGRES_USER || 'm7_admin';
const dbPass = process.env.DB_PASS || process.env.POSTGRES_PASSWORD || 'm7_master_password';
const dbHost = '127.0.0.1'; // Force localhost
const dbPort = '5433';       // Use mapped host port 5433
const dbName = process.env.DB_NAME || process.env.POSTGRES_DB || 'm7_logistica';

const pool = new pg.Pool({
    user: dbUser,
    host: dbHost,
    database: dbName,
    password: dbPass,
    port: parseInt(dbPort || '5432'),
});

async function renameColumn() {
    try {
        console.log('[MIGRATION] Conectando a la DB con:', { dbUser, dbHost, dbPort, dbName });
        
        // Verificar si la columna existe antes de renombrar
        const checkCol = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'documents_l' AND column_name = 'codplan';
        `);

        if (checkCol.rowCount && checkCol.rowCount > 0) {
            console.log('[MIGRATION] Renombrando columna codplan a remesatdm en la tabla documents_l...');
            await pool.query('ALTER TABLE documents_l RENAME COLUMN codplan TO remesatdm;');
            console.log('[MIGRATION] ¡Columna renombrada exitosamente!');
        } else {
            console.log('[MIGRATION] La columna codplan ya no existe o ya ha sido renombrada.');
        }

        // Verificar columnas actuales de documents_l
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'documents_l'
            ORDER BY ordinal_position;
        `);
        console.log('[MIGRATION] Columnas de documents_l:');
        res.rows.forEach(row => {
            console.log(`- ${row.column_name} (${row.data_type})`);
        });

    } catch (err: any) {
        console.error('[MIGRATION] Error:', err.message || err);
    } finally {
        await pool.end();
    }
}

renameColumn();
