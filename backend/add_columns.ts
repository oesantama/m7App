import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@postgres-podman:5432/m7_logistica' });

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ajover_b36_encabezado (
        id SERIAL PRIMARY KEY,
        os VARCHAR(255),
        id_viaje VARCHAR(255),
        fecha_carge TIMESTAMP,
        placa VARCHAR(50),
        conductor VARCHAR(255),
        fecha_programado TIMESTAMP,
        cant_clientes INTEGER,
        nombre_ruta VARCHAR(255),
        coordinador VARCHAR(255),
        usuariocontrol VARCHAR(255),
        fechacontrol TIMESTAMP,
        valor_flete NUMERIC,
        client_id VARCHAR(50),
        uploaded_by VARCHAR(50),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        inhouse_id VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS ajover_b36_detalle (
        id SERIAL PRIMARY KEY,
        id_enca INTEGER REFERENCES ajover_b36_encabezado(id) ON DELETE CASCADE,
        factura VARCHAR(255),
        notas TEXT,
        client_id VARCHAR(50)
      );

      -- Add columns if tables already existed
      ALTER TABLE ajover_b36_encabezado 
      ADD COLUMN IF NOT EXISTS id_viaje VARCHAR(255),
      ADD COLUMN IF NOT EXISTS inhouse_id VARCHAR(255);
    `);
    console.log("Tablas creadas y/o alteradas con éxito");
  } catch (err) {
    console.error("Error alterando tabla", err);
  } finally {
    await pool.end();
  }
}
run();
