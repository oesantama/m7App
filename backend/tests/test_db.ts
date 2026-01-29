
import pool from '../config/database.js';

async function testConfig() {
    console.log('--- DIAGNOSTICO DB ---');
    console.log('ENV DATABASE_URL:', process.env.DATABASE_URL);
    
    try {
        const client = await pool.connect();
        console.log('Conexión Exitosa');
        
        const res = await client.query('SELECT id, name, module_id FROM pages');
        console.log(`Registros encontrados: ${res.rows.length}`);
        
        const pag22 = res.rows.find((r: any) => r.id === 'PAG-22');
        if (pag22) {
            console.log('ENCONTRADO PAG-22:', pag22);
        } else {
            console.log('FALTA PAG-22. IDs encontrados:', res.rows.map((r: any) => r.id));
        }
        
        client.release();
    } catch (e) {
        console.error('ERROR CONEXION:', e);
    } finally {
        // Force exit
        process.exit(0);
    }
}

testConfig();
