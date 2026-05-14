import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});

async function fix() {
  console.log('[FIX] Iniciando reparación forzada de base de datos local...');
  const client = await pool.connect();
  try {
    const table = 'document_l_payments';
    console.log(`[FIX] Verificando tabla ${table}...`);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        invoice TEXT,
        client_ref TEXT,
        un_code TEXT,
        metodo_pago TEXT,
        vmetodo NUMERIC DEFAULT 0,
        user_id TEXT,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log(`[FIX] Tabla ${table} verificada/creada exitosamente.`);
    
    // También verificar grupo_inter_pedidos por si acaso
    await client.query(`
      CREATE TABLE IF NOT EXISTS grupo_inter_pedidos (
        id SERIAL PRIMARY KEY,
        numero_documento TEXT,
        cliente TEXT,
        ciudad_origen TEXT,
        ciudad_origen_cod TEXT,
        ciudad_destino TEXT,
        ciudad_destino_cod TEXT,
        estado TEXT,
        nro_guia TEXT,
        fecha_entregado TIMESTAMP WITH TIME ZONE,
        latitud NUMERIC DEFAULT 0,
        longitud NUMERIC DEFAULT 0,
        placa TEXT,
        acta_entrega_b64 TEXT,
        peso NUMERIC DEFAULT 0,
        cantidad NUMERIC DEFAULT 0,
        valor_flete NUMERIC DEFAULT 0,
        valor_declarado NUMERIC DEFAULT 0,
        history JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[FIX] Tabla grupo_inter_pedidos verificada.');

  } catch (error) {
    console.error('[FIX] Error durante la reparación:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();
