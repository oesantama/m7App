
import pool from '../config/database.js';

const migrateCategories = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('--- MIGRATING CATEGORIES ---');

        // 1. Create table
        console.log('Creating categories table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status_id TEXT DEFAULT 'EST-01',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create Sequence for ID generation (if not exists)
        // We will manage ID generation in code or via trigger, but let's set up a sequence for the counter.
        await client.query(`CREATE SEQUENCE IF NOT EXISTS category_id_seq START 1`);

        // 3. Migrate Data
        console.log('Migrating data from master_records...');
        const oldCats = await client.query("SELECT * FROM master_records WHERE category = 'masterCategorias'");
        
        for (const cat of oldCats.rows) {
            console.log(`Migrating: ${cat.name} (${cat.id})`);
            
            // Check if ID fits pattern CAT-XXX
            // If it does, keep it. If not, generate new? 
            // The user wants CAT-[CONSECUTIVO].
            // Existing IDs might be simple UUIDs or other strings.
            // Let's force them to be CAT-XXX if they aren't, but we must update references!
            
            // For now, let's keep the existing ID to avoid breaking foreign keys in `articles`.
            // The user requested the format for *new* records mainly. 
            // If we change IDs now, we have to update `articles`.
            
            await client.query(`
                INSERT INTO categories (id, name, description, status_id, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
            `, [cat.id, cat.name, cat.description, cat.statusId || 'EST-01', new Date(), new Date()]);
        }

        // 4. Update Sequence to max existing ID Number if possible (parsing CAT-XXX)
        // Simple logic: If we have CAT-01, next should be CAT-02.
        
        console.log('Migration Complete.');
        await client.query('COMMIT');
        process.exit(0);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration Failed:', error);
        process.exit(1);
    } finally {
        client.release();
    }
};

migrateCategories();
