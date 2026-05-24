import pool from '../config/database.js';

const dropIndex = async () => {
    try {
        console.log('Dropping unique index...');
        await pool.query('DROP INDEX IF EXISTS idx_rl_unique_record;');
        console.log('Index dropped successfully.');
    } catch (e) {
        console.error('Error dropping index:', e);
    } finally {
        process.exit(0);
    }
};

dropIndex();
