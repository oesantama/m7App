import pg from 'pg';
import dotenv from 'dotenv';
import { exec } from 'child_process';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.length === 0;
const isSingle = args.includes('--single');
const isExecute = args.includes('--execute');

function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) reject({ err, stderr });
            else resolve(stdout ? stdout.trim() : '');
        });
    });
}

async function run() {
    try {
        console.log("\n\x1b[36m============ GESTIÓN DE MIGRACIÓN SEGURA (CUMPLIDOS DRIVE) ============\x1b[0m");
        if (isDryRun) {
            console.log("\x1b[33m🛡️  MODO ACTIVO: SIMULACIÓN (DRY-RUN)\x1b[0m");
            console.log("   * No se modificará nada en Google Drive ni en la Base de Datos.");
            console.log("   * Para ejecutar una prueba única real: node scripts/rename_historical_files.js --single");
            console.log("   * Para ejecutar la migración completa: node scripts/rename_historical_files.js --execute\n");
        } else if (isSingle) {
            console.log("\x1b[35m🔬 MODO ACTIVO: PRUEBA ÚNICA (SINGLE TEST)\x1b[0m");
            console.log("   * Se procesará únicamente el PRIMER archivo histórico que se encuentre.");
            console.log("   * Se aplicará el renombrado real tanto en Google Drive como en la Base de Datos.");
            console.log("   * Te permitirá comprobar que todo esté correcto antes de correr el lote completo.\n");
        } else if (isExecute) {
            console.log("\x1b[31m🔥 MODO ACTIVO: EJECUCIÓN TOTAL (FULL EXECUTE)\x1b[0m");
            console.log("   * Se procesarán TODOS los archivos históricos del sistema en producción.");
            console.log("   * Se renombrarán físicamente en Google Drive y se actualizará el historial en BD.\n");
        }

        console.log("\x1b[36m🔍 Consultando archivos con prefijo numérico en la Base de Datos...\x1b[0m");
        const { rows } = await pool.query(`
            SELECT id, file_name, drive_path, drive_link 
            FROM document_drive_logs 
            WHERE file_name ~ '^[0-9]{13}_' AND is_deleted = false
            ORDER BY id ASC
        `);

        if (rows.length === 0) {
            console.log("\x1b[32m✅ ¡No se encontraron archivos históricos con prefijo para renombrar!\x1b[0m\n");
            return;
        }

        const totalToProcess = isSingle ? 1 : rows.length;
        console.log(`\x1b[34m📦 Se encontraron ${rows.length} archivos en total. Se procesarán: ${totalToProcess}\x1b[0m\n`);

        for (let i = 0; i < totalToProcess; i++) {
            const row = rows[i];
            const cleanName = row.file_name.replace(/^[0-9]{13}_/, '');
            
            const oldPath = `gdrive_cumplidos:${row.drive_path}/${row.file_name}`;
            const newPath = `gdrive_cumplidos:${row.drive_path}/${cleanName}`;

            console.log(`\x1b[33m[${i + 1}/${totalToProcess}] Archivo:\x1b[0m "${row.file_name}" ➡️ "\x1b[32m${cleanName}\x1b[0m"`);

            if (isDryRun) {
                console.log(`   \x1b[30m[SIMULACIÓN]\x1b[0m Se renombraría en Drive en: "${newPath}"`);
                console.log(`   \x1b[30m[SIMULACIÓN]\x1b[0m Se actualizaría la BD con ID: ${row.id}\n`);
                continue;
            }

            try {
                // 1. Renombrar físicamente el archivo en Google Drive usando rclone moveto
                console.log(`   🚀 Renombrando en Google Drive...`);
                await execPromise(`rclone moveto "${oldPath}" "${newPath}"`);
                
                // 2. Obtener el nuevo enlace público de Drive
                console.log(`   🔗 Generando nuevo link público...`);
                let driveLink = row.drive_link;
                try {
                    driveLink = await execPromise(`rclone link "${newPath}"`);
                } catch (linkErr) {
                    console.warn(`   ⚠️ Advertencia al generar link público de Drive:`, linkErr.stderr || linkErr);
                }

                // 3. Actualizar la base de datos
                console.log(`   💾 Actualizando registro en la Base de Datos...`);
                await pool.query(
                    `UPDATE document_drive_logs SET file_name = $1, drive_link = $2 WHERE id = $3`,
                    [cleanName, driveLink, row.id]
                );

                console.log(`   \x1b[32m✅ Completado con éxito.\x1b[0m\n`);
            } catch (err) {
                console.error(`   \x1b[31m❌ Error procesando el archivo "${row.file_name}":\x1b[0m`, err.stderr || err);
            }
        }

        if (isDryRun) {
            console.log("\x1b[32m🎉 Simulación finalizada. No se realizaron cambios reales.\x1b[0m");
            console.log("   Para realizar una prueba real de un solo archivo, ejecuta:");
            console.log("   \x1b[33mnode scripts/rename_historical_files.js --single\x1b[0m\n");
        } else if (isSingle) {
            console.log("\x1b[32m🎉 Prueba única real finalizada con éxito.\x1b[0m");
            console.log("   1. Por favor verifica que el archivo de prueba se visualice correctamente en la web.");
            console.log("   2. Confirma en tu Google Drive que el prefijo numérico haya sido eliminado.");
            console.log("   3. Si todo quedó perfecto, ejecuta la migración completa con:");
            console.log("   \x1b[31mnode scripts/rename_historical_files.js --execute\x1b[0m\n");
        } else {
            console.log("\x1b[32m🎉 ¡Migración e historial completado exitosamente de forma consistente!\x1b[0m\n");
        }

    } catch (err) {
        console.error("❌ Error en la migración:", err);
    } finally {
        await pool.end();
    }
}

run();
