
import pool from '../config/database.js';

const viewMismatches = async () => {
  try {
    console.log('Viewing ID vs SKU mismatches...');
    
    // Select the mismatches
    const result = await pool.query('SELECT id, sku, name FROM articles WHERE id != sku');
    console.log('Mismatched Rows:', JSON.stringify(result.rows, null, 2));
    
    // Check if these IDs are used in document_items (FK check)
    if (result.rows.length > 0) {
        console.log('Checking Foreign Key dependencies...');
        for (const row of result.rows) {
            const fkCheck = await pool.query('SELECT COUNT(*) FROM document_items WHERE article_id = $1', [row.id]);
            console.log(`Article ID ${row.id} used in ${fkCheck.rows[0].count} document_items.`);
        }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error viewing mismatches:', error);
    process.exit(1);
  }
};

viewMismatches();
