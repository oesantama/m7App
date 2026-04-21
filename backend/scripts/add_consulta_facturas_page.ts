/**
 * Script: add_consulta_facturas_page
 * Registra la página "Consulta de Facturas" en la tabla pages
 * con el mismo parent_id del módulo donde están las demás páginas de GESTIÓN AJOVER.
 *
 * Ejecutar en el servidor:
 *   npx tsx backend/scripts/add_consulta_facturas_page.ts
 */

import pool from '../config/database.js';

const run = async () => {
    try {
        // 1. Buscar el parent_id de páginas conocidas del mismo módulo
        const existing = await pool.query(`
            SELECT id, name, route, parent_id, status_id
            FROM pages
            WHERE route IN ('conciliacion', 'despacho', 'rutas', 'documentos', 'recibido')
            LIMIT 5
        `);

        console.log('\n=== Páginas existentes del módulo ===');
        existing.rows.forEach(r => console.log(r));

        if (!existing.rows.length) {
            console.error('\n❌ No se encontraron páginas de referencia. Abortando.');
            process.exit(1);
        }

        // Tomamos el parent_id de cualquiera de ellas (deben ser iguales)
        const parentId = existing.rows[0].parent_id;
        const statusId = existing.rows[0].status_id;

        // 2. Generar un ID nuevo que no colisione
        const maxId = await pool.query(`
            SELECT id FROM pages WHERE id ~ '^PAG-[0-9]+$' ORDER BY id DESC LIMIT 1
        `);

        let newId = 'PAG-01';
        if (maxId.rows.length) {
            const lastNum = parseInt(maxId.rows[0].id.replace('PAG-', ''), 10);
            newId = `PAG-${lastNum + 1}`;
        }

        console.log(`\n📝 Insertando página: id=${newId}  parent_id=${parentId}  status_id=${statusId}`);

        await pool.query(`
            INSERT INTO pages (id, name, route, parent_id, status_id, created_by, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'System', 'System', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                name       = EXCLUDED.name,
                route      = EXCLUDED.route,
                parent_id  = EXCLUDED.parent_id,
                status_id  = EXCLUDED.status_id,
                updated_at = CURRENT_TIMESTAMP
        `, [newId, 'Consulta de Facturas', 'consulta-facturas', parentId, statusId]);

        console.log(`\n✅ Página '${newId} - Consulta de Facturas' (route=consulta-facturas) creada correctamente.`);
        console.log('   Reinicie la app o recargue la página para ver el nuevo ítem en el menú.\n');

        process.exit(0);
    } catch (err: any) {
        console.error('\n❌ Error:', err.message);
        process.exit(1);
    }
};

run();
