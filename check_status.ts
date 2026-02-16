
import { Client } from 'pg';

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'm7migracion',
  password: 'admin',
  port: 5432,
});

async function check() {
    await client.connect();
    const res = await client.query("SELECT * FROM master_records WHERE category = 'masterEstados' OR category = 'masterStates'");
    console.log(res.rows);
    await client.end();
}

check();
