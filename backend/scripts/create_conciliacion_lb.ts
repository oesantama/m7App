import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS conciliacion_lb_archivos (
        id SERIAL PRIMARY KEY,
        nombre_archivo VARCHAR(255) NOT NULL,
        mes_anio VARCHAR(50),
        total_registros INTEGER DEFAULT 0,
        coincidencias INTEGER DEFAULT 0,
        discrepancias INTEGER DEFAULT 0,
        novedades INTEGER DEFAULT 0,
        total_milla7 NUMERIC(15, 2) DEFAULT 0,
        diferencia_neta NUMERIC(15, 2) DEFAULT 0,
        usuario_creacion VARCHAR(100),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conciliacion_lb_detalles (
        id SERIAL PRIMARY KEY,
        archivo_id INTEGER REFERENCES conciliacion_lb_archivos(id) ON DELETE CASCADE,
        fecha VARCHAR(50),
        placa VARCHAR(50),
        systram VARCHAR(100),
        viaje_pedido VARCHAR(100),
        destino VARCHAR(255),
        articulo VARCHAR(255),
        precio_archivo_base NUMERIC(15, 2),
        precio_70_base NUMERIC(15, 2),
        precio_conciliacion NUMERIC(15, 2),
        diferencia NUMERIC(15, 2),
        valor_adicional NUMERIC(15, 2),
        total_milla7 NUMERIC(15, 2),
        estado VARCHAR(50),
        tipo_validacion VARCHAR(100),
        notas_validacion TEXT,
        notas2 TEXT
      );
    `);

    // Unique index to prevent duplicate trips across the system. 
    // Usually a trip is identified by its systram and viaje_pedido.
    // However, some records might lack them if the excel is badly formed.
    // We will only index if they are not empty.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_systram_viaje 
      ON conciliacion_lb_detalles (systram, viaje_pedido) 
      WHERE systram != '' AND viaje_pedido != '';
    `);

    await client.query('COMMIT');
    console.log('Tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createTables();
