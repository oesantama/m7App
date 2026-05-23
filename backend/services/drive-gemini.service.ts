import { GoogleGenerativeAI } from "@google/generative-ai";
import pool from '../config/database.js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

const getAPIKeysPool = (): string[] => {
    const rawKeys = process.env.GEMINI_API_KEY || '';
    return rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

export const syncDriveCumplidos = async () => {
    console.log('[M7-CRON] Iniciando sincronización de Drive vs Planillas para CLI-09...');
    
    const startTime = Date.now();
    let status = 'SUCCESS';
    let details = 'No hubo archivos nuevos por procesar.';
    let errorMessage = '';
    let processedCount = 0;
    let savedCount = 0;
    let failedCount = 0;

    try {
        // 1. Obtener los documentos de Drive (CUMPLIDOS) del cliente CLI-09 de los últimos 5 días
        // Que NO existan ya en la tabla registros_logistica (verificando si el pedido está en el file_name)
        const query = `
            SELECT d.id, d.file_name, d.drive_path 
            FROM document_drive_logs d
            WHERE d.category = 'CUMPLIDOS' 
              AND d.client_id = 'CLI-09'
              AND d.created_at >= CURRENT_DATE - INTERVAL '5 days'
              AND NOT EXISTS (
                  SELECT 1 FROM registros_logistica rl 
                  WHERE rl.archivo = d.file_name
              )
        `;
        const { rows: missingDocs } = await pool.query(query);

        if (missingDocs.length === 0) {
            console.log('[M7-CRON] No hay cumplidos pendientes por procesar para CLI-09.');
            return;
        }

        console.log(`[M7-CRON] Se encontraron ${missingDocs.length} cumplidos sin procesar en planillas.`);

        const keys = getAPIKeysPool();
        if (keys.length === 0) {
            console.error('[M7-CRON] No hay API keys disponibles para procesar.');
            return;
        }

        let keyIndex = 0;
        const tmpDir = path.join(process.cwd(), 'scratch', 'temp_pdfs');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        for (let i = 0; i < missingDocs.length; i++) {
            const doc = missingDocs[i];
            const localPath = path.join(tmpDir, doc.file_name);
            const remotePath = `gdrive_cumplidos:${doc.drive_path}/${doc.file_name}`;

            try {
                // Descargar archivo de Drive vía rclone
                console.log(`[M7-CRON] Descargando ${doc.file_name}...`);
                await execAsync(`rclone copyto "${remotePath}" "${localPath}"`);

                // Leer archivo y convertir a Base64
                const fileBuffer = fs.readFileSync(localPath);
                const base64Data = fileBuffer.toString('base64');

                // IA Prompt (El mismo del frontend)
                const systemPrompt = `
Estrae en el siguiente json la informacion de la planilla por favor.
Recuerda que si es del exito es una planilla y extrae como json. Unicamente devuelve el objeto json sin texto.
Formato de salida (Devolver un array de objetos):
[
  {
    "pedido": "extraer numero de pedido si existe (en planillas exito puede decir PEDIDO O FACTURA o ORDEN DE COMPRA)",
    "cedula": "extraer cc del cliente si existe",
    "cliente": "extraer nombre del cliente",
    "plu": "extraer material o plu (es un numero que identifica el producto por lo general en el exito es PLU o EAN O MATERIAL)",
    "articulo": "extraer descripcion del articulo",
    "direccion": "extraer direccion",
    "fecha1": "extraer primera fecha si existe",
    "fecha2": "extraer segunda fecha si existe",
    "ciudad_barrio": "extraer ciudad y/o barrio si existe",
    "placa": "extraer placa del vehiculo si existe",
    "notas": "extraer observaciones adicionales si existen"
  }
]
`;

                const genAI = new GoogleGenerativeAI(keys[keyIndex % keys.length]);
                const modelIA = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                console.log(`[M7-CRON] Analizando ${doc.file_name} con IA...`);
                const result = await modelIA.generateContent([
                    systemPrompt,
                    { inlineData: { data: base64Data, mimeType: "application/pdf" } }
                ]);
                
                const responseText = await result.response.text();
                
                // Extraer JSON de la respuesta
                const cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const matches = JSON.parse(cleanJsonStr);

                if (Array.isArray(matches) && matches.length > 0) {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
                            const analysis = matches[mIdx];
                            const insQuery = `
                                INSERT INTO registros_logistica 
                                (archivo, pedido, cedula, cliente, plu, articulo, direccion, fecha1, fecha2, ciudad_barrio, placa, notas)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                                ON CONFLICT (archivo, pedido, cedula, plu) DO NOTHING
                            `;
                            await client.query(insQuery, [
                                doc.file_name,
                                analysis.pedido || 'N/A',
                                analysis.cedula || 'N/A',
                                analysis.cliente || 'N/A',
                                analysis.plu || 'N/A',
                                analysis.articulo || 'N/A',
                                analysis.direccion || 'N/A',
                                analysis.fecha1 || 'N/A',
                                analysis.fecha2 || 'N/A',
                                analysis.ciudad_barrio || 'N/A',
                                analysis.placa || 'N/A',
                                analysis.notas || ''
                            ]);
                        }
                        await client.query('COMMIT');
                        savedCount += matches.length;
                        console.log(`[M7-CRON] Guardado en DB: ${doc.file_name}`);
                    } catch (dbErr) {
                        await client.query('ROLLBACK');
                        throw dbErr;
                    } finally {
                        client.release();
                    }
                }

            } catch (err: any) {
                failedCount++;
                console.error(`[M7-CRON] Error procesando ${doc.file_name}:`, err.message);
                if (err.message.includes('429')) {
                    keyIndex++; // Rotar llave si hay límite de cuota
                }
            } finally {
                processedCount++;
                // Borrar archivo temporal
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }
                // Pausa para evitar rate limits
                await new Promise(r => setTimeout(r, 4000));
            }
        }

        details = `Procesados: ${processedCount}/${missingDocs.length}. Errores individuales: ${failedCount}. Registros extraídos: ${savedCount}`;
        console.log('[M7-CRON] Sincronización finalizada.');

    } catch (globalErr: any) {
        status = 'ERROR';
        errorMessage = globalErr.message || 'Error desconocido';
        console.error('[M7-CRON] Error global en sincronización:', globalErr);
    } finally {
        const durationMs = Date.now() - startTime;
        
        try {
            await pool.query(
                `INSERT INTO cron_logs (task_name, status, details, error_message, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
                ['Sync_Drive_Planillas_CLI09', status, details, errorMessage, durationMs]
            );
        } catch (logErr: any) {
            console.error('[M7-CRON] Error crítico al intentar guardar el log del cron:', logErr.message);
        }
    }
};
