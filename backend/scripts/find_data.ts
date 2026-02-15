
import pool from '../config/database.js';

const findData = async () => {
  try {
    const term = '%MAESTRO%';
    console.log(`Searching for "${term}"...`);

    const t1 = await pool.query(`SELECT * FROM modules WHERE name ILIKE $1`, [term]);
    console.log('Found in modules:', t1.rows.length);
    if(t1.rows.length) console.log(JSON.stringify(t1.rows[0]));

    const t2 = await pool.query(`SELECT * FROM master_modulos WHERE name ILIKE $1`, [term]);
    console.log('Found in master_modulos:', t2.rows.length);
    if(t2.rows.length) console.log(JSON.stringify(t2.rows[0]));

    const t3 = await pool.query(`SELECT * FROM master_records WHERE name ILIKE $1 AND category = 'masterModulos'`, [term]);
    console.log('Found in master_records (cat=masterModulos):', t3.rows.length);
    if(t3.rows.length) console.log(JSON.stringify(t3.rows[0]));
    
    // Check for Categories in master_records
    const t4 = await pool.query(`SELECT * FROM master_records WHERE category = 'masterCategorias' LIMIT 1`);
    console.log('Found masterCategorias in master_records:', t4.rows.length);

    process.exit(0);
  } catch (error) {
    console.error('Search failed:', error);
    process.exit(1);
  }
};

findData();
