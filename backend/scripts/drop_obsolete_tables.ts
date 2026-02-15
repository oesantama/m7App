
import pool from '../config/database.js';

const dropObsolete = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('--- DROPPING OBSOLETE TABLES ---');

    // 1. Drop master_modulos
    console.log('Dropping master_modulos...');
    await client.query('DROP TABLE IF EXISTS master_modulos');

    // 2. Drop master_paginas
    console.log('Dropping master_paginas...');
    await client.query('DROP TABLE IF EXISTS master_paginas');

    await client.query('COMMIT');
    console.log('Cleanup Complete. Tables dropped successfully.');
    process.exit(0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cleanup Failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
};

dropObsolete();
