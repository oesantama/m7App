import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@postgres-podman:5432/m7_logistica' });

async function run() {
  try {
    await pool.query(`
      ALTER TABLE ajover_b36_detalle 
      ADD COLUMN IF NOT EXISTS volumen NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS peso NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cubicaje NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cantidad NUMERIC DEFAULT 0;
    `);
    console.log("Columnas de volumen, peso, cubicaje agregadas al detalle con éxito");
  } catch (err) {
    console.error("Error alterando tabla", err);
  } finally {
    await pool.end();
  }
}
run();
