import pool from '../config/database.js';

async function migrate() {
    try {
        console.log('[MIGRACIÓN] Creando índices para optimizar Grupo Inter y Mastersuite...');
        
        // Índices para Grupo Inter (Solución Error 502)
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_gi_f_ultimo_corte ON grupo_inter_pedidos (f_ultimo_corte DESC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_gi_no_factura_m7 ON grupo_inter_pedidos (no_factura_m7);
            CREATE INDEX IF NOT EXISTS idx_gi_placa ON grupo_inter_pedidos (placa);
            CREATE INDEX IF NOT EXISTS idx_gi_numero_planilla ON grupo_inter_pedidos (numero_planilla);
            CREATE INDEX IF NOT EXISTS idx_gi_nit ON grupo_inter_pedidos (nit);
            CREATE INDEX IF NOT EXISTS idx_gi_estado ON grupo_inter_pedidos (estado);
        `);

        // Índices para Mastersuite (Optimización de búsquedas cruzadas)
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_dl_external_doc_id ON documents_l (external_doc_id);
            CREATE INDEX IF NOT EXISTS idx_di_invoice ON document_items (invoice);
            CREATE INDEX IF NOT EXISTS idx_di_order_number ON document_items (order_number);
            CREATE INDEX IF NOT EXISTS idx_ri_invoice_id ON route_invoices (invoice_id);
            CREATE INDEX IF NOT EXISTS idx_da_invoice_id ON dispatch_assignments (invoice_id);
        `);

        console.log('[MIGRACIÓN] Índices creados con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRACIÓN] Error al crear índices:', err);
        process.exit(1);
    }
}

migrate();
