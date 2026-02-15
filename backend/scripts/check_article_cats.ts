
import pool from '../config/database.js';

const checkArticleCategories = async () => {
    try {
        console.log('--- CHECKING ARTICLE CATEGORIES ---');
        
        // 1. Get current categories from master_records
        const cats = await pool.query("SELECT id, name FROM master_records WHERE category = 'masterCategorias'");
        console.log('Existing Categories:', JSON.stringify(cats.rows, null, 2));
        
        // 2. Check articles using these IDs
        const articles = await pool.query('SELECT id, name, category_articulo_id FROM articles WHERE category_articulo_id IS NOT NULL LIMIT 5');
        console.log('Sample Articles with Categories:', JSON.stringify(articles.rows, null, 2));

        // 3. Count usage
        const usage = await pool.query(`
            SELECT category_articulo_id, COUNT(*) 
            FROM articles 
            WHERE category_articulo_id IS NOT NULL 
            GROUP BY category_articulo_id
        `);
        console.log('Category Usage Counts:', JSON.stringify(usage.rows, null, 2));

        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
};
checkArticleCategories();
