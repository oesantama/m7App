import pool from './config/database';

async function repairColumns() {
  try {
    console.log("Iniciando reparación de columnas Grupo Inter...");
    
    // Añadir columna tipo_articulo si no existe
    await pool.query('ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS tipo_articulo TEXT;');
    
    // Asegurar que history sea un JSONB
    await pool.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grupo_inter_pedidos' AND column_name='history') THEN
                ALTER TABLE grupo_inter_pedidos ADD COLUMN history JSONB DEFAULT '[]'::jsonb;
            END IF;
        END $$;
    `);

    console.log("¡Columnas reparadas exitosamente!");
  } catch (err) {
    console.error("Error al reparar columnas:", err);
  } finally {
    process.exit(0);
  }
}

repairColumns();
