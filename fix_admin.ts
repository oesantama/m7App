
import pool from './backend/config/database';
import bcrypt from 'bcryptjs';

async function fixAdmin() {
    const client = await pool.connect();
    try {
        const email = 'admin@millasiete.com';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        const res = await client.query('SELECT * FROM users WHERE email = $1', [email]);

        if (res.rows.length === 0) {
            console.log('Admin user NOT found. Creating...');
            await client.query(`
        INSERT INTO users (id, email, password, name, role_id, status_id)
        VALUES ('USR-01', $1, $2, 'Administrador', 'ROL-ADMIN', 'EST-01')
      `, [email, hashedPassword]);
            console.log('Admin user created.');
        } else {
            console.log('Admin user found. Resetting password...');
            await client.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
            console.log('Admin password reset to: admin123');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        process.exit();
    }
}

fixAdmin();
