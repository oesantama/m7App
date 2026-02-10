
import pool from '../backend/config/database.js';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.join(process.cwd(), 'backend', 'full_restore.sql');

const TABLES = [
    'roles',
    'modules',
    'pages',
    'users',
    'clients',
    'master_records',
    'vehicles',
    'drivers',
    'articles',
    'documents_l',
    'document_items',
    'assignments',
    'user_permissions'
];

async function exportData() {
    console.log('📦 Iniciando exportación de base de datos local...');
    let sqlContent = '-- BACKUP AUTOMÁTICO M7 --\n\n';

    // 1. Schema Base (por si acaso)
    // No incluimos CREATE TABLE aquí para no conflictos complejos, asumimos restoreSystem crea tablas.
    // Pero sí necesitamos limpiar datos para evitar duplicados si se corre sobre sucio,
    // Aunque "Option 2" suele ser "Override".

    // Orden de borrado inverso a dependencias
    const tablesReversed = [...TABLES].reverse();
    for (const table of tablesReversed) {
        sqlContent += `TRUNCATE TABLE ${table} CASCADE;\n`;
    }
    sqlContent += '\n';

    const client = await pool.connect();

    try {
        for (const table of TABLES) {
            console.log(`Exportando ${table}...`);
            const res = await client.query(`SELECT * FROM ${table}`);

            if (res.rows.length === 0) continue;

            const columns = Object.keys(res.rows[0]).join(', ');

            for (const row of res.rows) {
                const values = Object.values(row).map(val => {
                    if (val === null) return 'NULL';
                    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                    if (typeof val === 'number') return val;
                    if (Array.isArray(val)) {
                        // Postgres array syntax '{a,b}'
                        const arrStr = val.map(v => `"${v}"`).join(',');
                        return `'{${arrStr}}'`;
                    }
                    if (typeof val === 'object') {
                        // JSON
                        return `'${JSON.stringify(val)}'`;
                    }
                    // String escape
                    return `'${String(val).replace(/'/g, "''")}'`;
                }).join(', ');

                sqlContent += `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
            }
            sqlContent += '\n';
        }

        fs.writeFileSync(OUTPUT_FILE, sqlContent);
        console.log(`✅ Backup guardado en: ${OUTPUT_FILE}`);
        console.log(`Bytes: ${sqlContent.length}`);

    } catch (err) {
        console.error('❌ Error exportando:', err);
    } finally {
        client.release();
        process.exit();
    }
}

exportData();
