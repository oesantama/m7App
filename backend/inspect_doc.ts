
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: 'postgres://m7_admin:m7_master_password@localhost:5432/m7_logistica'
});

async function inspect() {
  try {
    const res = await pool.query("SELECT * FROM documents_l WHERE external_doc_id = 'L010904165' OR id = 'L010904165'");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

inspect();
