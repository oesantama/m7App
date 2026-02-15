
import pool from '../config/database.js';

const checkCats = async () => {
    try {
        const res = await pool.query(`SELECT category, count(*) FROM master_records GROUP BY category`);
        console.table(res.rows);
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
};
checkCats();
