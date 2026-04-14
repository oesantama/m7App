
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde la raíz del proyecto
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixStatus() {
  const client = await pool.connect();
  try {
    console.log('Iniciando corrección de estados en document_items...');
    
    // 1. Corregir registros actuales
    const fixRes = await client.query(`
      UPDATE document_items 
      SET item_status = 'EST-03' 
      WHERE item_status = 'PENDIENTE' OR item_status IS NULL
    `);
    console.log(`Se actualizaron ${fixRes.rowCount} registros a 'EST-03'.`);

    // 2. Cambiar valor por defecto de la columna
    await client.query(`
      ALTER TABLE document_items 
      ALTER COLUMN item_status SET DEFAULT 'EST-03'
    `);
    console.log('Valor por defecto de item_status actualizado a \'EST-03\'.');

    // 3. Verificar si hay otras tablas que necesiten ajuste (opcional)
    
  } catch (err) {
    console.error('Error durante la corrección:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStatus();
