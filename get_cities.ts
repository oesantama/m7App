import pool from './backend/config/database.ts';

async function test() {
  const res = await pool.query(`
    SELECT DISTINCT UPPER(TRIM(city)) as city FROM management_orders WHERE city IS NOT NULL
    UNION
    SELECT DISTINCT UPPER(TRIM(ciudad_origen)) as city FROM flota_tdm_manifiestos WHERE ciudad_origen IS NOT NULL
    UNION
    SELECT DISTINCT UPPER(TRIM(ciudad_destino)) as city FROM flota_tdm_manifiestos WHERE ciudad_destino IS NOT NULL
  `);
  console.log(res.rows.map(r => r.city).sort().join('\n'));
  process.exit(0);
}
test();
