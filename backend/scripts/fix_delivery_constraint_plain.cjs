const { Pool } = require('pg');

// Extraer configuración de un archivo .env si existiera o usar valores por defecto
// En este caso, asumimos que podemos conectar localmente o con variables de entorno
const pool = new Pool({
  user: process.env.DB_USER || 'm7_admin',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'm7_logistica',
  password: process.env.DB_PASS || 'm7_master_password',
  port: process.env.DB_PORT || 5432,
});

async function fixDeliveryConstraint() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('[M7-FIX] Actualizando restricción de delivery_type (JS version)...');
    
    await client.query(`
      ALTER TABLE delivery_confirmations 
      DROP CONSTRAINT IF EXISTS delivery_confirmations_delivery_type_check;
    `);
    
    await client.query(`
      ALTER TABLE delivery_confirmations 
      ADD CONSTRAINT delivery_confirmations_delivery_type_check 
      CHECK (delivery_type IN ('FULL', 'PARTIAL', 'RETURN', 'REPICE', 'ENTREGA', 'DEVOLUCION', 'PARCIAL'));
    `);
    
    await client.query('COMMIT');
    console.log('[M7-FIX] Restricción actualizada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[M7-FIX] ERROR:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}

fixDeliveryConstraint();
