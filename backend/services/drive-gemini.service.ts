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
    let cronLogId: number | null = null;

    try {
        const initLog = await pool.query(
            `INSERT INTO cron_logs (task_name, status, details, error_message, duration_ms) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            ['Sync_Drive_Planillas_CLI09', 'RUNNING', 'Iniciando sincronización. Analizando PDFs pendientes...', null, 0]
        );
        cronLogId = initLog.rows[0]?.id || null;
    } catch(e) {
        console.error('[M7-CRON] Error insertando log inicial:', e);
    }

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
            if (cronLogId) {
                await pool.query(`UPDATE cron_logs SET status='SUCCESS', details='No hay PDFs nuevos por procesar' WHERE id=$1`, [cronLogId]);
                cronLogId = null; // Para no actualizarlo de nuevo en el finally
            }
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
            
            if (cronLogId) {
                await pool.query(
                    `UPDATE cron_logs SET details = $1 WHERE id = $2`,
                    [`[${i + 1}/${missingDocs.length}] Procesando ${doc.file_name}...`, cronLogId]
                );
            }

            const localPath = path.join(tmpDir, doc.file_name);
            const remotePath = `gdrive_cumplidos:${doc.drive_path}/${doc.file_name}`;

            // Retraso de 4.5 segundos para no saturar la cuota gratuita de Gemini (15 RPM)
            if (i > 0) {
                console.log(`[M7-CRON] Esperando 4.5s para no exceder cuota de Gemini...`);
                await new Promise(resolve => setTimeout(resolve, 4500));
            }

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
3. ORIENTACIÓN Y ENCABEZADOS: La imagen puede estar rotada (de lado o de cabeza). Antes de extraer, busca los encabezados "Pedido", "Cédula", "Cliente", "PLU", "Descripción". Estos definen el orden de las columnas y la orientación real.
4. ERROR DE IMPRESIÓN (COLUMNA CONDENSADA): La columna de PLUs y Descripciones se imprimió más pequeña que la de Pedidos, por lo que el texto se va subiendo y cruza las líneas divisorias. ¡IGNORA LAS LÍNEAS HORIZONTALES PARA LOS PLUS! 
5. EMPAREJAMIENTO SECUENCIAL ESTRICTO (1 A 1): Como las líneas no coinciden, debes extraer la lista completa de Pedidos (izquierda) y la lista completa de PLUs (derecha). Empareja ESTRICTAMENTE en orden: el Pedido #1 con el PLU #1, el Pedido #2 con el PLU #2, el Pedido #3 con el PLU #3, y así sucesivamente.
6. HUECOS AL FINAL: Si hay más Pedidos que PLUs (ej. 13 Pedidos y 12 PLUs), el ÚLTIMO Pedido (y solo el último) debe quedar con el PLU y Artículo como un string vacío (""). JAMÁS dejes en blanco a un cliente en el medio de la lista. Todos los del medio DEBEN tener su PLU asignado en orden secuencial.
7. SEPARACIÓN DE PEDIDO Y CÉDULA PEGADOS: Si ves un número extremadamente largo (ej. "163352206107970043502"), es porque el Pedido y la Cédula se imprimieron pegados. Sepáralos por lógica: los primeros ~13 dígitos son el Pedido ("1633522061079") y los últimos dígitos la Cédula ("70043502").
7. DESCRIPCIONES DE ARTÍCULOS: Copia el texto exacto. Si ves texto parcial o cortado, pon lo que alcances a leer. Si no hay nada, pon un string vacío ("").
8. PROHIBIDO REPETIR VALORES CREADOS: Cada fila tiene su propio Pedido. Nunca inventes o dupliques el pedido de la fila de arriba a menos que sea visualmente idéntico. IGNORA cualquier texto borroso o "fantasma" que esté montado sobre las líneas divisoras.
5. Los números de "Pedido" en el Éxito suelen empezar por 16 o 26.
6. LIMPIEZA OBLIGATORIA DEL PEDIDO: Si ves letras o guiones antes del pedido (ej. "E-com 163287...", "E-con163...", "D 391..."), IGNÓRALOS. Extrae ÚNICAMENTE LOS NÚMEROS (ej. "163287...", "391..."). No devuelvas letras ni símbolos en el campo pedido.
7. PLU ESTRICTAMENTE POSITIVO: Los números de PLU NUNCA son negativos. Si ves un guion antes del PLU (ej. "-3698640"), es un guion separador o mancha. Escribe solo "3698640".

EJEMPLO DE LECTURA (Fíjate cómo se limpian los pedidos):
Fila 1 (E-com 1633032041116): Pedido 1633032041116, Cédula 39268715, Cliente ALBA TERESA
Fila 2 (D 39107413): Pedido 39107413, Cédula 187311634, Cliente JUNEYLIS CONTRERAS

Formato OBLIGATORIO de salida: { "matches": [ {objeto} ] }

Campos exactos por cada fila:
- pedido (SOLO NÚMEROS, sin letras "E-com" ni guiones)
- cedula (Extraer estrictamente la CC o NIT del cliente de ESTA FILA)
- cliente (Extraer nombre del cliente de ESTA FILA)
- plu (SOLO NÚMERO POSITIVO, sin signos negativos)
- articulo (Extraer descripción del artículo de ESTA FILA)
- direccion (Extraer dirección)
- fecha1 (Extraer fecha de despacho)
- fecha2 (Extraer otra fecha si existe)
- ciudad_barrio (Extraer ciudad/barrio)
- placa (Extraer placa)
- notas (Extraer observaciones)
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
                const parsed = JSON.parse(cleanJsonStr);
                const matches = parsed.matches || (Array.isArray(parsed) ? parsed : []);

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
            if (cronLogId) {
                await pool.query(
                    `UPDATE cron_logs SET status=$1, details=$2, error_message=$3, duration_ms=$4 WHERE id=$5`,
                    [status, details, errorMessage, durationMs, cronLogId]
                );
            } else {
                await pool.query(
                    `INSERT INTO cron_logs (task_name, status, details, error_message, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
                    ['Sync_Drive_Planillas_CLI09', status, details, errorMessage, durationMs]
                );
            }
        } catch (logErr: any) {
            console.error('[M7-CRON] Error crítico al intentar guardar el log del cron:', logErr.message);
        }
    }
};
