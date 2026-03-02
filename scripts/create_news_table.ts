import pool from '../backend/config/database';

const createTable = async () => {
    try {
        console.log('[INIT-DB] Creando tabla inventory_news...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_news (
                id SERIAL PRIMARY KEY,
                document_id TEXT REFERENCES documents_l(id) ON DELETE CASCADE,
                article_id TEXT,
                quantity NUMERIC DEFAULT 0,
                observation TEXT,
                photo_urls TEXT[], 
                user_name TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[INIT-DB] Tabla creada o ya existente.');
        process.exit(0);
    } catch (err) {
        console.error('[INIT-DB] Error:', err);
        process.exit(1);
    }
};

createTable();
