import pool from './backend/config/database.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'grupo_inter_pedidos'
        `);
        console.log('--- COLUMNAS EN grupo_inter_pedidos ---');
        res.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));
        process.exit(0);
    } catch (err) {
        console.error('Error al verificar esquema:', err);
        process.exit(1);
    }
}

checkSchema();
