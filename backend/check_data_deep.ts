import pool from './config/database.js';

async function check() {
  try {
    const res = await pool.query('SELECT categoria, count(*) FROM gh_miscelaneos GROUP BY categoria');
    console.log('Categories in gh_miscelaneos:');
    console.table(res.rows);

    const res2 = await pool.query('SELECT id, nombre, categoria FROM gh_miscelaneos WHERE id IN (1, 2, 3, 4, 5, 20) ORDER BY id');
    console.log('IDs found in gh_miscelaneos:');
    console.table(res2.rows);

    const res3 = await pool.query('SELECT * FROM gh_encuestas_sociodemograficas LIMIT 1');
    console.log('Survey sample:');
    console.log(res3.rows[0]);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
