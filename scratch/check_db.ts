import pool from './config/database.js';

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'gh_encuestas_sociodemograficas'
    `);
    console.log('Columns of gh_encuestas_sociodemograficas:');
    console.table(res.rows);

    const res2 = await pool.query('SELECT id, nombre, tabla FROM gh_miscelaneos LIMIT 20');
    console.log('Sample from gh_miscelaneos:');
    console.table(res2.rows);

    const res3 = await pool.query('SELECT * FROM gh_encuestas_sociodemograficas LIMIT 1');
    console.log('Sample survey data:');
    console.log(JSON.stringify(res3.rows[0], null, 2));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
