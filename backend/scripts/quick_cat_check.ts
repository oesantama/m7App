
import pool from '../config/database.js';

const checkCats = async () => {
    try {
        const res = await pool.query(`SELECT id, name, route FROM pages ORDER BY id ASC`);
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
};
checkCats();
