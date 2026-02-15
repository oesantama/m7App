
import pool from '../config/database.js';

const finalCheck = async () => {
  try {
    console.log('--- FINAL DATA CHECK ---');

    const counts = {
        modules: (await pool.query('SELECT count(*) FROM modules')).rows[0].count,
        master_modulos: (await pool.query('SELECT count(*) FROM master_modulos')).rows[0].count,
        pages: (await pool.query('SELECT count(*) FROM pages')).rows[0].count,
        master_paginas: (await pool.query('SELECT count(*) FROM master_paginas')).rows[0].count,
    };
    console.log('Table Counts:', JSON.stringify(counts, null, 2));

    const masterRecordsCheck = {
        masterCategorias: (await pool.query("SELECT count(*) FROM master_records WHERE category = 'masterCategorias'")).rows[0].count,
        masterModulos: (await pool.query("SELECT count(*) FROM master_records WHERE category = 'masterModulos'")).rows[0].count,
        masterPaginas: (await pool.query("SELECT count(*) FROM master_records WHERE category = 'masterPaginas'")).rows[0].count
    };
    console.log('Master Records Categories:', JSON.stringify(masterRecordsCheck, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Check failed:', error);
    process.exit(1);
  }
};

finalCheck();
