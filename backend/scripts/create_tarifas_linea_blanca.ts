import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let connectionString = process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica';
if (connectionString.includes('@postgres:')) {
  connectionString = connectionString.replace('@postgres:', '@localhost:');
}

console.log('[DB-SCRIPT] Connection string resolved to:', connectionString);

const pool = new Pool({
  connectionString: connectionString
});

async function run() {
  console.log('[DB-SCRIPT] Conectando a la base de datos...');
  const client = await pool.connect();
  try {
    const table = 'tarifas_linea_blanca';
    console.log(`[DB-SCRIPT] Creando tabla ${table}...`);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id SERIAL PRIMARY KEY,
        destino TEXT NOT NULL,
        articulo TEXT NOT NULL,
        precio NUMERIC(15,2) NOT NULL,
        usuario_creacion TEXT,
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(destino, articulo)
      )
    `);
    
    console.log(`[DB-SCRIPT] ¡ÉXITO! La tabla ${table} ha sido creada correctamente.`);
    
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    
    console.log(`[DB-SCRIPT] Columnas de ${table}:`);
    res.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('[DB-SCRIPT] Error ejecutando la creación:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
