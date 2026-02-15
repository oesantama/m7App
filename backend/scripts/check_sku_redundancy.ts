
import pool from '../config/database.js';

const checkRedundancy = async () => {
  try {
    console.log('Checking ID vs SKU redundancy...');
    
    const result = await pool.query('SELECT id, sku FROM articles LIMIT 20');
    console.table(result.rows);

    const countDiff = await pool.query('SELECT COUNT(*) FROM articles WHERE id != sku');
    console.log(`Rows where id != sku: ${countDiff.rows[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('Error checking redundancy:', error);
    process.exit(1);
  }
};

checkRedundancy();
