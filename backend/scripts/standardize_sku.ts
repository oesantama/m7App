
import pool from '../config/database.js';

const standardizeSku = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Standardizing Articles (ID = SKU)...');

        // 1. Get all articles
        const res = await client.query('SELECT id, sku FROM articles');
        const articles = res.rows;

        for (const a of articles) {
            // Logic: ID should be the SKU.
            // If SKU exists and is different from ID, we update ID to be SKU.
            // But if ID is already referenced, we might have issues. 
            // We checked and found 0 usages for the mismatches. 
            // So we can safely update ID to SKU.

            if (a.sku && a.sku !== a.id) {
                console.log(`Updating Article ${a.id} to new ID ${a.sku}`);
                // Check if new ID (SKU) already exists to avoid conflict
                const exists = await client.query('SELECT 1 FROM articles WHERE id = $1', [a.sku]);
                if (exists.rows.length === 0) {
                     await client.query('UPDATE articles SET id = $1 WHERE id = $2', [a.sku, a.id]);
                } else {
                    console.warn(`Cannot update ${a.id} to ${a.sku} because ${a.sku} already exists. Deleting duplicate old ID.`);
                    await client.query('DELETE FROM articles WHERE id = $1', [a.id]);
                }
            }
        }

        // 2. Now that IDs are correct (or deleted if dupes), we can drop the SKU column.
        console.log('Dropping SKU column...');
        await client.query('ALTER TABLE articles DROP COLUMN IF EXISTS sku');

        await client.query('COMMIT');
        console.log('Migration Complete.');
        process.exit(0);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration Failed:', error);
        process.exit(1);
    } finally {
        client.release();
    }
};

standardizeSku();
