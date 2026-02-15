
import pool from '../config/database.js';

const checkSchema = async () => {
  try {
    console.log('--- CHECKING ARTICLES TABLE COLUMNS ---');
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'articles'
      ORDER BY column_name;
    `);
    console.table(res.rows);
    
    console.log('--- SAMPLE DATA ---');
    const sample = await pool.query('SELECT id, uom_std FROM articles LIMIT 3');
    console.log(JSON.stringify(sample.rows, null, 2));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
checkSchema();
