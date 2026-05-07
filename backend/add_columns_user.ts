import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@postgres-podman:5432/m7_logistica' });

async function run() {
  try {
    await pool.query(`
      ALTER TABLE ajover_b36_encabezado 
      ADD COLUMN IF NOT EXISTS usercreated VARCHAR(255);
      
      ALTER TABLE ajover_b36_detalle
      DROP COLUMN IF EXISTS client_id;
    `);
    console.log("Columna usercreated agregada y client_id removida del detalle.");
  } catch (err) {
    console.error("Error alterando tabla", err);
  } finally {
    await pool.end();
  }
}
run();
