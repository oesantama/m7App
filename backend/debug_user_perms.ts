
import pool from '../config/database.js';

const checkUser = async () => {
  try {
    const email = 'conductor@millasiete.com';
    console.log(`Checking user: ${email}`);
    
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
        console.log('User not found');
        return;
    }
    const user = userRes.rows[0];
    console.log('User Data:', {
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.role_id
    });

    const permRes = await pool.query('SELECT * FROM user_permissions WHERE user_id = $1', [user.id]);
    if (permRes.rows.length === 0) {
        console.log('No permissions record found for this user.');
    } else {
        const p = permRes.rows[0];
        console.log('Permissions Record:', {
            id: p.id,
            user_id: p.user_id,
            permissions_type: typeof p.permissions,
            permissions_snippet: JSON.stringify(p.permissions).substring(0, 200) + '...'
        });
    }
  } catch (e) {
      console.error(e);
  } finally {
      process.exit();
  }
};

checkUser();
