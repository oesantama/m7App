import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import pool from '../config/database.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const execAsync = util.promisify(exec);

const BASC_FOLDERS = [
  '01_Normativa_y_Manuales',
  '02_Analisis_de_Riesgos',
  '03_Asociados_de_Negocio',
  '04_Seguridad_Fisica_y_Personal',
  '05_Auditorias_e_Informes'
];

const LOCAL_BASE = path.join(process.cwd(), 'backend', 'docs', 'basc');

const runStandaloneSync = async () => {
  console.log('[BASC-STANDALONE-SYNC] Iniciando escaneo independiente...');
  const startTime = Date.now();
  let status = 'SUCCESS';
  let processedCount = 0;
  let newCount = 0;
  let errorsCount = 0;
  let errorMsg = '';

  // 1. Setup local folders if not exists
  if (!fs.existsSync(LOCAL_BASE)) {
    fs.mkdirSync(LOCAL_BASE, { recursive: true });
  }
  BASC_FOLDERS.forEach(folder => {
    const dir = path.join(LOCAL_BASE, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 2. Insert running log in DB
  let logId: number | null = null;
  try {
    const initLog = await pool.query(
      `INSERT INTO basc_sync_logs (status, details) VALUES ($1, $2) RETURNING id`,
      ['RUNNING', 'Iniciando escaneo de documentos BASC vía script...']
    );
    logId = initLog.rows[0].id;
  } catch (logErr: any) {
    console.error('Error insertando log inicial en DB:', logErr.message);
  }

  const client = await pool.connect();
  try {
    // 3. Scan Google Drive (via rclone)
    const rcloneRemote = 'gdrive_cumplidos';
    let rcloneAvailable = false;
    try {
      await execAsync('which rclone');
      rcloneAvailable = true;
    } catch {}

    if (rcloneAvailable) {
      console.log('[BASC-STANDALONE-SYNC] Rclone detectado. Sincronizando Google Drive BASC folder...');
      try {
        await execAsync(`rclone sync "${rcloneRemote}:BASC" "${LOCAL_BASE}" --update --create-empty-src-dirs`);
      } catch (rcloneErr: any) {
        console.warn('[BASC-STANDALONE-SYNC] Rclone sync falló, usando archivos locales:', rcloneErr.message);
      }
    } else {
      console.log('[BASC-STANDALONE-SYNC] Rclone no disponible, usando archivos locales...');
    }

    // 4. Scan directories and update DB
    for (const folder of BASC_FOLDERS) {
      const dirPath = path.join(LOCAL_BASE, folder);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath);
      for (const fileName of files) {
        processedCount++;
        const fullPath = path.join(dirPath, fileName);
        const stats = fs.statSync(fullPath);
        const ext = path.extname(fileName).toLowerCase();

        // Check DB status
        const docCheck = await client.query(
          'SELECT * FROM basc_documents WHERE folder = $1 AND file_name = $2',
          [folder, fileName]
        );

        let dbDoc = docCheck.rows[0];
        let needsReprocessing = !dbDoc || Number(dbDoc.size_bytes) !== stats.size;

        if (needsReprocessing) {
          newCount++;
          console.log(`[BASC-STANDALONE-SYNC] Indexando archivo: ${folder}/${fileName}`);

          let content = '';
          try {
            if (ext === '.pdf') {
              const pdfBuffer = fs.readFileSync(fullPath);
              const pdfData = await pdfParse(pdfBuffer);
              content = pdfData.text || '';
            } else if (ext === '.txt' || ext === '.md' || ext === '.json') {
              content = fs.readFileSync(fullPath, 'utf8');
            } else {
              content = `Documento ${fileName} (tipo ${ext}) indexado por metadatos.`;
            }
          } catch (readErr: any) {
            errorsCount++;
            console.error(`Error leyendo contenido de ${fileName}:`, readErr.message);
            content = `Error de lectura: ${readErr.message}`;
          }

          // Insert or update document
          if (!dbDoc) {
            const insertRes = await client.query(
              `INSERT INTO basc_documents (file_name, folder, drive_path, drive_link, mime_type, size_bytes, sync_status, error_message)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              [fileName, folder, `${folder}/${fileName}`, `/basc/files/${folder}/${fileName}`, ext === '.pdf' ? 'application/pdf' : 'text/plain', stats.size, 'SYNCHRONIZED', null]
            );
            dbDoc = insertRes.rows[0];
          } else {
            await client.query(
              `UPDATE basc_documents 
               SET size_bytes = $1, last_sync_at = NOW(), sync_status = $2, error_message = $3
               WHERE id = $4`,
              [stats.size, 'SYNCHRONIZED', null, dbDoc.id]
            );
            await client.query('DELETE FROM basc_document_chunks WHERE document_id = $1', [dbDoc.id]);
          }

          // Chunk content
          if (content && content.trim().length > 0) {
            const chunkSize = 1000;
            const overlap = 200;
            const chunks: any[] = [];
            let index = 0;

            for (let offset = 0; offset < content.length; offset += chunkSize - overlap) {
              const chunkText = content.substring(offset, offset + chunkSize).trim();
              if (chunkText.length > 50) {
                chunks.push({
                  document_id: dbDoc.id,
                  chunk_index: index++,
                  content: chunkText
                });
              }
              if (offset + chunkSize >= content.length) break;
            }

            for (const chunk of chunks) {
              await client.query(
                `INSERT INTO basc_document_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)`,
                [chunk.document_id, chunk.chunk_index, chunk.content]
              );
            }
          }
        }
      }
    }

    console.log(`[BASC-STANDALONE-SYNC] Completado. Procesados: ${processedCount}, Nuevos: ${newCount}, Errores: ${errorsCount}`);
  } catch (err: any) {
    status = 'ERROR';
    errorMsg = err.message || 'Error desconocido en script';
    errorsCount++;
    console.error('[BASC-STANDALONE-SYNC] Error en ejecución:', err);
  } finally {
    client.release();
    const durationMs = Date.now() - startTime;
    const details = `Ejecución de script finalizada. Procesados: ${processedCount}. Nuevos: ${newCount}. Errores: ${errorsCount}.`;

    if (logId) {
      try {
        await pool.query(
          `UPDATE basc_sync_logs SET status=$1, processed_files=$2, new_files=$3, errors_count=$4, details=$5, duration_ms=$6, error_message=$7 WHERE id=$8`,
          [status, processedCount, newCount, errorsCount, details, durationMs, errorMsg || null, logId]
        );
      } catch (logErr: any) {
        console.error('Error actualizando log final en DB:', logErr.message);
      }
    }
    
    // Close DB pool connection to let script exit gracefully
    await pool.end();
    process.exit(status === 'SUCCESS' ? 0 : 1);
  }
};

runStandaloneSync();
