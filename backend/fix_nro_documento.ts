import pool from './config/database.js';

async function fix() {
    try {
        console.log('Renaming nro_documento to numero_documento...');
        await pool.query('ALTER TABLE grupo_inter_pedidos RENAME COLUMN nro_documento TO numero_documento;');
        console.log('Column renamed successfully!');
    } catch (e: any) {
        if (e.code === '42703') {
            console.log('Column nro_documento does not exist. Probably already renamed.');
        } else {
            console.error('Error renaming column:', e);
        }
    } finally {
        process.exit(0);
    }
}

fix();
