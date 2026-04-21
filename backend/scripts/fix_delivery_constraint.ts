import pool from '../config/database';

async function fixDeliveryConstraint() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('[M7-FIX] Actualizando restricción de delivery_type...');
    
    // 1. Eliminar la restricción actual
    await client.query(`
      ALTER TABLE delivery_confirmations 
      DROP CONSTRAINT IF EXISTS delivery_confirmations_delivery_type_check;
    `);
    
    // 2. Agregar la nueva restricción con los valores correctos que envía el frontend
    // Se agregan tanto los valores en inglés (frontend) como los normalizados por si acaso
    await client.query(`
      ALTER TABLE delivery_confirmations 
      ADD CONSTRAINT delivery_confirmations_delivery_type_check 
      CHECK (delivery_type IN ('FULL', 'PARTIAL', 'RETURN', 'REPICE', 'ENTREGA', 'DEVOLUCION', 'PARCIAL'));
    `);
    
    // 3. Opcional: Asegurarse de que no existan registros que violen esto (aunque debería estar vacío o con valores viejos)
    // No hacemos nada con los datos por ahora para no romper histórico si existe.
    
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
