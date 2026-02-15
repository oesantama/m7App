
import pool from '../config/database.js';

const analyzeSchema = async () => {
  try {
    console.log('--- SCHEMA ANALYSIS ---');

    // 1. Check Row Counts for Duplicates
    const tablesToCheck = ['modules', 'master_modulos', 'pages', 'master_paginas', 'master_records'];
    const counts: any = {};
    
    for (const t of tablesToCheck) {
        try {
            const res = await pool.query(`SELECT count(*) FROM "${t}"`);
            counts[t] = parseInt(res.rows[0].count);
        } catch (e) { counts[t] = 'Not Found'; }
    }
    console.log('Row Counts:', JSON.stringify(counts, null, 2));

    // 2. Analyze master_records categories
    console.log('\n--- MASTER_RECORDS CATEGORIES ---');
    try {
        const res = await pool.query(`
            SELECT category, COUNT(*) as count 
            FROM master_records 
            GROUP BY category 
            ORDER BY count DESC
        `);
        // Log one by one
        res.rows.forEach(r => console.log(JSON.stringify(r)));
    } catch (e) { console.log('Error analyzing master_records', e); }

    // 3. Samples
    console.log('\n--- SAMPLES ---');
    if (counts['modules'] > 0) {
        const r = await pool.query('SELECT * FROM modules LIMIT 1');
        console.log('MODULES:', JSON.stringify(r.rows[0]));
    }
    if (counts['master_modulos'] > 0) {
        const r = await pool.query('SELECT * FROM master_modulos LIMIT 1');
        console.log('MASTER_MODULOS:', JSON.stringify(r.rows[0]));
    }
    
    if (counts['pages'] > 0) {
        const r = await pool.query('SELECT * FROM pages LIMIT 1');
        console.log('PAGES:', JSON.stringify(r.rows[0]));
    }
    if (counts['master_paginas'] > 0 && typeof counts['master_paginas'] === 'number') {
        const r = await pool.query('SELECT * FROM master_paginas LIMIT 1');
        console.log('MASTER_PAGINAS:', JSON.stringify(r.rows[0]));
    }

    process.exit(0);
  } catch (error) {
    console.error('Analysis failed:', error);
    process.exit(1);
  }
};

analyzeSchema();
