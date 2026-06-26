import pool from '../config/database.js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { AIOrchestrator } from './ai-orchestrator/orchestrator.js';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const execAsync = util.promisify(exec);

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
            LIMIT 5
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

            if (i > 0) {
                console.log(`[M7-CRON] Esperando 4.5s para no exceder cuota de Gemini...`);
                await new Promise(resolve => setTimeout(resolve, 4500));
            }

            try {
                // Descargar archivo de Drive vía rclone
                console.log(`[M7-CRON] Descargando ${doc.file_name}...`);
                await execAsync(`rclone copyto "${remotePath}" "${localPath}"`);

                // Extraer texto con pdf-parse localmente para ahorrar muchísimos tokens
                let textContent = '';
                let useTextFallback = false;
                try {
                    const fileBuffer = fs.readFileSync(localPath);
                    const pdfData = await pdfParse(fileBuffer);
                    textContent = pdfData.text.trim();
                    if (textContent.length > 100) {
                         useTextFallback = true;
                    }
                } catch (e) {
                    console.error(`[M7-CRON] Error leyendo PDF localmente:`, e);
                }

                const systemPrompt = `
Eres un asistente experto en extracción de datos tabulares a JSON.
Analiza esta planilla de despacho y extrae TODOS los registros en formato JSON.
Actúa exactamente igual que cuando te piden "extraer pedidos en una tabla".

REGLAS DE EXTRACCIÓN:
1. Extrae CADA FILA de la tabla como un objeto independiente. No omitas NINGÚN registro. Si hay 13 pedidos, deben haber 13 objetos.
2. Mapea la información de forma lógica, asignando a cada cliente su PLU y Descripción correspondiente según el orden natural del documento.
3. Si un cliente tiene la celda de PLU o Descripción vacía o con un error como "#¿NOMBRE?", deja el valor en la respuesta JSON como un string vacío (""). NO uses "N/A".
4. Si el Pedido y la Cédula están pegados (ej. "163352206107970043502"), el Pedido son los primeros ~13 dígitos y la Cédula el resto.
5. Limpia el número de pedido: quita prefijos como "E-com" o guiones. Solo devuelve los números.
6. Los PLU son siempre números positivos. Ignora guiones iniciales (ej. "-3698640" es "3698640").
7. IMPORTANTE: La "placa" del vehículo (ej. JYN070, ABC-123) usualmente NO está dentro de la tabla principal. Búscala en el recuadro que suele estar justo debajo de la tabla, a veces al lado del nombre del conductor (ej: "JYN070 JOSE HENRY..."). Una vez la encuentres, asígnale esa misma placa al campo "placa" de TODOS los registros extraídos de la tabla.

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

                let matches: any[] = [];
                try {
                    let promptText = systemPrompt;
                    if (useTextFallback) {
                        promptText += `\n\nTEXTO EXTRAÍDO DEL DOCUMENTO:\n\n${textContent}`;
                    }

                    console.log(`[M7-CRON] Analizando ${doc.file_name} usando AIOrchestrator...`);
                    const result = await AIOrchestrator.execute({
                        prompt: promptText,
                        imageBuffer: useTextFallback ? undefined : fs.readFileSync(localPath),
                        imageMimeType: useTextFallback ? undefined : 'application/pdf',
                        taskType: 'extraction',
                        temperature: 0.1
                    });

                    const cleanJsonStr = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJsonStr);
                    matches = parsed.matches || (Array.isArray(parsed) ? parsed : []);
                } catch (apiErr: any) {
                    throw apiErr;
                }

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
                                analysis.pedido || '',
                                analysis.cedula || '',
                                analysis.cliente || '',
                                analysis.plu || '',
                                analysis.articulo || '',
                                analysis.direccion || '',
                                analysis.fecha1 || '',
                                analysis.fecha2 || '',
                                analysis.ciudad_barrio || '',
                                analysis.placa || '',
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
                console.error(`[M7-CRON] Fallo definitivo en ${doc.file_name}:`, lastFileError);
            } finally {
                processedCount++;
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }
            }
            
            // Si el último error es de cuota y se agotaron los intentos, abortar todo el cron
            const isQuotaError = lastFileError && (
                lastFileError.includes('429') || 
                lastFileError.toLowerCase().includes('quota') || 
                lastFileError.toLowerCase().includes('limit') ||
                lastFileError.toLowerCase().includes('exhausted')
            );
            if (isQuotaError) {
                console.warn('[M7-CRON] Se agotaron todas las API Keys por límite de cuota. Abortando lote...');
                errorMessage = 'Cuota excedida en todas las llaves del orquestador. Pausado hasta el próximo ciclo.';
                break;
            }

            await new Promise(r => setTimeout(r, 4000));
        }

        details = `Procesados: ${processedCount}/${missingDocs.length}. Errores individuales: ${failedCount}. Registros extraídos: ${savedCount}`;
        if (failedCount > 0 && !errorMessage) {
            errorMessage = `Último error de archivo: ${lastFileError}`;
            if (savedCount === 0) status = 'ERROR';
        } else if (errorMessage && (errorMessage.includes('429') || errorMessage.toLowerCase().includes('cuota') || errorMessage.toLowerCase().includes('quota'))) {
            status = 'ERROR';
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
