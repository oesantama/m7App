
import pool from '../config/database';
import fs from 'fs';
import path from 'path';

const runNormalization = async () => {
    try {
        console.log('[M7-NORMALIZER] Iniciando proceso de normalización de IDs...');
        
        const sqlPath = path.join(process.cwd(), 'backend', 'scripts', 'normalize_ids.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`No se encontró el archivo SQL en: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('[M7-NORMALIZER] Ejecutando script SQL...');
        const res = await pool.query(sql);
        
        console.log('[M7-NORMALIZER] ¡Normalización completada exitosamente!');
        if (Array.isArray(res)) {
            res.forEach((r, i) => {
                if (r.command === 'SELECT') console.table(r.rows);
            });
        } else if (res.command === 'SELECT') {
            console.table(res.rows);
        }

        process.exit(0);
    } catch (e) {
        console.error('[M7-NORMALIZER] ERROR FATAL:', e);
        process.exit(1);
    }
};

runNormalization();
