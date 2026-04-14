import pool from './backend/config/database.js';

async function migrate() {
    try {
        console.log('[MIGRACIÓN] Iniciando creación de tablas de Novedades y Reajustes...');
        
        await pool.query(`
            -- Tabla de Novedades
            CREATE TABLE IF NOT EXISTS grupo_inter_novedades (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL, -- Ej: Daño, Faltante, Retraso
                observacion TEXT,
                fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Tabla de Reajustes
            CREATE TABLE IF NOT EXISTS grupo_inter_reajustes (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                numero_documento TEXT,
                valor NUMERIC DEFAULT 0,
                notas TEXT,
                fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Asegurar columnas necesarias en la tabla principal si no existen
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS numero_planilla TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS fecha_viaje TIMESTAMP WITH TIME ZONE;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS no_factura_m7 TEXT;
        `);

        console.log('[MIGRACIÓN] Tablas creadas con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRACIÓN] Error:', err);
        process.exit(1);
    }
}

migrate();
