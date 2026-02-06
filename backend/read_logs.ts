
// Mock env for local test
process.env.DATABASE_URL = 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica';

import pool from './config/database.js';

async function read() {
    try {
        console.log('Querying logs...');
        const result = await pool.query('SELECT phone_number, status, error_message, sent_at FROM whatsapp_logs ORDER BY sent_at DESC LIMIT 10');
        
        if (result.rows.length === 0) {
            console.log('No logs found.');
        } else {
            result.rows.forEach(row => {
                console.log(`--- ${row.sent_at} ---`);
                console.log(`Number: ${row.phone_number}`);
                console.log(`Status: ${row.status}`);
                console.log(`Error:  ${row.error_message || 'NONE'}`);
            });
        }
        process.exit(0);
    } catch (e: any) {
        console.error('DB ERROR:', e.message);
        process.exit(1);
    }
}

read();
