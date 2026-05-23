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
    let lastFileError = '';

    try {
        // 1. Obtener los documentos de Drive (CUMPLIDOS) del cliente CLI-09 de los últimos 5 días
        // Que NO existan ya en la tabla registros_logistica (verificando si el pedido está en el file_name)
        const query = `
            SELECT d.id, d.file_name, d.drive_path 
            FROM document_drive_logs d
            WHERE d.category = 'CUMPLIDOS' 
              AND d.client_id = 'CLI-09'
              AND d.upload_date >= CURRENT_DATE - INTERVAL '5 days'
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
Eres un asistente experto en extracción de datos tabulares a JSON.
Analiza este DOCUMENTO LOGÍSTICO (planilla de despacho/entrega) y extrae TODOS y CADA UNO de los registros individuales como un JSON.

REGLAS CRÍTICAS DE EXTRACCIÓN (LEER CON CUIDADO):
1. CADA FILA en la tabla del PDF debe ser un objeto independiente en el arreglo.
2. IMPORTANTE: La imagen puede estar rotada 90 o 180 grados. Identifica la orientación real del texto para no mezclar columnas con filas.
3. PROHIBIDO REPETIR VALORES: Cada fila tiene su propio número de Pedido y Cédula. NUNCA copies el pedido o la cédula de la fila anterior a menos que en la imagen sean visualmente idénticos.
4. Los números de Pedido y Cédula en el Éxito suelen empezar por 16 o 26 (ej. 265793870, 16330320...). Lee dígito por dígito con extrema precisión.

EJEMPLO DE LECTURA (Fíjate cómo cambia cada fila):
Fila 1: Pedido 1633032041116, Cédula 39268715, Cliente ALBA TERESA
Fila 2: Pedido 265793871, Cédula 8373907, Cliente ROBERTO BENAVIDES
Fila 3: Pedido 265793870, Cédula 1045142382, Cliente ORIANA MARIA
Fila 4: Pedido 265793778, Cédula 1038102053, Cliente Nilton Cesar

Formato de salida esperado (Devolver un array de objetos):
[
  {
    "pedido": "Extraer estrictamente el número de pedido, factura u orden de ESTA FILA.",
    "cedula": "Extraer estrictamente la CC o NIT del cliente de ESTA FILA.",
    "cliente": "Extraer nombre del cliente de ESTA FILA.",
    "plu": "Extraer material o PLU/EAN de ESTA FILA.",
    "articulo": "Extraer descripción del artículo de ESTA FILA.",
    "direccion": "Extraer dirección.",
    "fecha1": "Extraer fecha de despacho.",
    "fecha2": "Extraer otra fecha si existe.",
    "ciudad_barrio": "Extraer ciudad/barrio.",
    "placa": "Extraer placa del vehículo asignado a la planilla.",
    "notas": "Extraer observaciones adicionales."
  }
]
`;

                const genAI = new GoogleGenerativeAI(keys[keyIndex % keys.length]);
                const modelIA = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
                lastFileError = err.message || 'Error desconocido';
                console.error(`[M7-CRON] Error procesando ${doc.file_name}:`, lastFileError);
                if (lastFileError.includes('429')) {
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
        if (failedCount > 0 && !errorMessage) {
            errorMessage = `Último error de archivo: ${lastFileError}`;
            if (savedCount === 0) status = 'ERROR';
        }
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
