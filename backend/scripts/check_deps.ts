
import pool from '../config/database.js';

const checkDependencies = async () => {
    try {
        console.log('Checking dependencies for master_modulos and master_paginas...');
        
        const query = `
            SELECT
                tc.constraint_name, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu 
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name IN ('master_modulos', 'master_paginas');
        `;
        
        const res = await pool.query(query);
        console.table(res.rows);
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
};
checkDependencies();
