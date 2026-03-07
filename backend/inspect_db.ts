import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function inspectSchema() {
    try {
        console.log('[INSPECT] Conectando a la DB...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'grupo_inter_pedidos'
            ORDER BY ordinal_position;
        `);
        console.log('[INSPECT] Columnas de grupo_inter_pedidos:');
        res.rows.forEach(row => {
            console.log(`- ${row.column_name} (${row.data_type})`);
        });
        
        const countRes = await pool.query("SELECT COUNT(*) FROM grupo_inter_pedidos");
        console.log(`[INSPECT] Total registros: ${countRes.rows[0].count}`);
        
        const pendingRes = await pool.query("SELECT COUNT(*) FROM grupo_inter_pedidos WHERE estado != 'Entregado'");
        console.log(`[INSPECT] Registros pendientes (estado != 'Entregado'): ${pendingRes.rows[0].count}`);

    } catch (err: any) {
        console.error('[INSPECT] Error:', err.message);
    } finally {
        await pool.end();
    }
}

inspectSchema();
