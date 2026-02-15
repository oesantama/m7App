
import pool from '../config/database';

const audit = async () => {
    try {
        console.log('--- AUDITORÍA DE MÓDULOS ---');
        const modules = await pool.query('SELECT id, name FROM modules ORDER BY id');
        console.table(modules.rows);

        console.log('\n--- AUDITORÍA DE PÁGINAS ---');
        const pages = await pool.query('SELECT id, name, route, parent_id FROM pages ORDER BY id');
        console.table(pages.rows);

        console.log('\n--- AUDITORÍA DE PERMISOS POR ROL ---');
        const rolePerms = await pool.query('SELECT role_id, page_id, can_view, can_create, can_edit, can_delete FROM role_permissions LIMIT 20');
        console.table(rolePerms.rows);

        console.log('\n--- AUDITORÍA DE PERMISOS POR USUARIO ---');
        const userPerms = await pool.query('SELECT user_id, page_id, can_view, can_create, can_edit, can_delete FROM user_permissions LIMIT 20');
        console.table(userPerms.rows);

        process.exit(0);
    } catch (e) {
        console.error('ERROR EN AUDITORÍA:', e);
        process.exit(1);
    }
};

audit();
