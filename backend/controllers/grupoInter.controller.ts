import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Función para obtener el pool de API Keys desde el CSV
const getAPIKeysPool = (): string[] => {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    return rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

// Variable para el pool de base de datos garantizando columnas base
let schemaChecked = false;
const ensureSchema = async () => {
    if (schemaChecked) return;
    try {
        await pool.query(`
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS update_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS update_by TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        schemaChecked = true;
    } catch (e) {
        console.error('[GRUPO-INTER] Error al normalizar esquema:', e);
    }
};

// Variable para rastrear qué llave estamos usando (Round Robin)
let currentKeyIndex = 0;

// Función para obtener el modelo de visión con inicialización perezosa (Lazy)
const getVisionModel = (modelName?: string, forceApiKey?: string) => {
    const keys = getAPIKeysPool();
    const apiKey = forceApiKey || keys[currentKeyIndex % keys.length] || '';
    
    if (!apiKey) {
        console.error('[OCR-NUCLEAR] ❌ ERROR CRÍTICO: No se detectó ninguna API Key válida en el pool.');
    }
    
    // M7-DYNAMIC-MODEL: Usar .env o fallback estable
    const modelId = modelName || process.env.AI_MODEL || "gemini-1.5-flash"; 
    
    const keyForLog = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
    console.log(`[OCR-NUCLEAR] 🧠 Key [${(currentKeyIndex % keys.length) + 1}/${keys.length}] | Modelo: ${modelId} | Key: ${keyForLog}`);
    
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: modelId });
};

// No inicializar globalmente para evitar capturar process.env vacío al arranque
let visionModel: any = null;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(model: any, promptData: any, sendProgress: Function, maxRetries = 4, workerContext?: { id: number, keyIndex: number }) {
    const keys = getAPIKeysPool();
    let localModel = model;
    let poolTrialCount = 0;
    const workerLabel = workerContext ? `[W${workerContext.id + 1}]` : '';

    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await localModel.generateContent(promptData);
            return result;
        } catch (error: any) {
            const errorStr = (error.toString() + (error.message || '')).toLowerCase();
            const isQuotaError = errorStr.includes('429') || error.status === 429 || errorStr.includes('quota');
            
            if (isQuotaError && i < maxRetries - 1) {
                // FASE 1: Extraer tiempo de espera sugerido por Google
                let waitSeconds = 0;
                const matchFull = errorStr.match(/retry in ([\d.]+)(s|ms)/);
                
                if (matchFull) {
                    waitSeconds = parseFloat(matchFull[1]);
                    if (matchFull[2].toLowerCase().startsWith('m')) waitSeconds /= 1000;
                    waitSeconds += 2; // Margen de seguridad nuclear
                }

                // FASE 2: Comportamiento Aislado (MODO WORKER v1.9.25)
                if (workerContext) {
                    // En modo trabajador, NO rotamos llaves. Esperamos sobre la nuestra.
                    // Esto evita el "Thundering Herd" (todos volcándose sobre la misma llave siguiente).
                    const backoff = Math.max(waitSeconds, Math.pow(2, i) * 5); // Backoff inteligente local
                    sendProgress({ 
                        type: 'log', 
                        message: `⚠️ ${workerLabel} Cuota excedida. Reintentando en ${Math.round(backoff)}s sobre Key [${workerContext.keyIndex + 1}]...`,
                        isWaiting: true 
                    });
                    await sleep(backoff * 1000);
                    continue;
                }

                // FASE 3: Rotación Tradicional (Para contexto secuencial/chatbot)
                if (keys.length > 1) {
                    currentKeyIndex++;
                    poolTrialCount++;
                    const nextKey = keys[currentKeyIndex % keys.length];
                    
                    if (poolTrialCount >= keys.length) {
                        const pauseTime = Math.max(30, waitSeconds);
                        sendProgress({ 
                            type: 'log', 
                            message: `⚠️ POOL SATURADO. Pausa Nuclear de ${Math.round(pauseTime)}s...`,
                            isWaiting: true 
                        });
                        await sleep(pauseTime * 1000);
                        poolTrialCount = 0;
                    } else {
                        const shortWait = Math.max(5, waitSeconds);
                        sendProgress({ 
                            type: 'log', 
                            message: `⚠️ Rotando a Key [${(currentKeyIndex % keys.length) + 1}/${keys.length}] (${Math.round(shortWait)}s)...` 
                        });
                        await sleep(shortWait * 1000);
                    }
                    
                    localModel = getVisionModel("gemini-2.0-flash", nextKey);
                    continue;
                }

                // FASE 4: Backup Backoff
                if (waitSeconds === 0) {
                    waitSeconds = Math.pow(1.5, i) * 15 + Math.random() * 5;
                }
                sendProgress({ 
                    type: 'log', 
                    message: `⚠️ ${workerLabel} Reintentando en ${Math.round(waitSeconds)}s...`,
                    isWaiting: true 
                });
                await sleep(waitSeconds * 1000);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`Milla 7: ${workerLabel} Agotó cuota tras ${maxRetries} intentos.`);
}

export const uploadExcel = async (req: any, res: Response): Promise<void> => {
    try {
        await ensureSchema();
        if (!req.file) {
            res.status(400).json({ message: 'No se subió ningún archivo' });
            return;
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const normalize = (str: string) => 
            String(str || '')
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9 ]/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .toUpperCase();

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        console.log(`[GRUPO-INTER] Filas totales detectadas: ${rows.length}`);
        
        let headerRowIndex = -1;
        const columnAliases = {
            numero_documento: ['NUMERO DOCUMENTO', 'NRO DOCUMENTO', 'DOCUMENTO', 'REMISION', 'PEDIDO', 'NRO PEDIDO', 'ORDEN'],
            nit: ['NIT CLIENTE', 'NIT', 'IDENTIFICACION'],
            cliente: ['NOMBRE CLIENTE', 'CLIENTE', 'RAZON SOCIAL'],
            direccion: ['DIRECCION', 'DIR'],
            notas_encabezado: ['NOTA ENCABEZADO', 'NOTAS', 'OBSERVACIONES'],
            municipio_destino: ['MUNICIPIO DESTINO', 'CIUDAD DESTINO', 'CIUDAD', 'DESTINO', 'DESTINO FINAL'],
            producto: ['PRODUCTO', 'ARTICULO', 'ITEM'],
            cantidad_total: ['CANTIDAD TOTAL', 'CANTIDAD', 'TOTAL'],
            precio_total: ['PRECIO TOTAL', 'PRECIO', 'VALOR'],
            tipo_articulo: ['TIPO ARTICULO', 'TIPO_ART_INTER', 'CATEGORIA ARTICULO'],
            empresa: ['EMPRESA', 'COMPAÑIA'],
            peso_total_prod: ['PESO TOTAL PROD.', 'PESO', 'PESO TOTAL'],
            f_ultimo_corte: ['F. ULTIMO CORTE', 'F ULTIMO CORTE', 'ULTIMO CORTE', 'CORTE'],
            clasificacion: ['CLASIFICACION', 'CATEGORIA'], 
            placa: ['PLACA', 'VEHICULO'],
            longitud: ['LONGITUD'],
            latitud: ['LATITUD']
        };

        const allIdentifyAliases = [...columnAliases.numero_documento, ...columnAliases.cliente].map(a => normalize(a));
        
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = (rows[i] || []).map(cell => normalize(String(cell)));
            if (currentRow.some(cell => allIdentifyAliases.some(alias => cell.includes(alias)))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            res.status(400).json({ message: 'El formato no es el indicado (no se encontraron encabezados)' });
            return;
        }

        const headerRow = (rows[headerRowIndex] || []).map(cell => normalize(String(cell)));
        console.log(`[GRUPO-INTER] Cabeceras:`, headerRow);

        const getColIndex = (aliases: string[]) => {
            const normalizedAliases = aliases.map(a => normalize(a));
            // Prioridad 1: Coincidencia Exacta
            let idx = headerRow.findIndex(cell => normalizedAliases.some(alias => cell === alias));
            if (idx >= 0) return idx;
            // Prioridad 2: El encabezado contiene el alias (e.g. "PEDIDO" en "NRO PEDIDO")
            // Pero evitamos falsos positivos si el alias es muy corto (como "TIPO")
            return headerRow.findIndex(cell => normalizedAliases.some(alias => {
                if (alias.length <= 4) return cell === alias; // Para "TIPO", "NIT", "DIR" exigimos casi exactitud
                return cell.includes(alias);
            }));
        };

        const idxDoc = getColIndex(columnAliases.numero_documento);
        const idxNit = getColIndex(columnAliases.nit);
        const idxClient = getColIndex(columnAliases.cliente);
        const idxDir = getColIndex(columnAliases.direccion);
        const idxNota = getColIndex(columnAliases.notas_encabezado);
        const idxDest = getColIndex(columnAliases.municipio_destino);
        const idxProd = getColIndex(columnAliases.producto);
        const idxCant = getColIndex(columnAliases.cantidad_total);
        const idxPrecio = getColIndex(columnAliases.precio_total);
        const idxTipo = getColIndex(columnAliases.tipo_articulo);
        const idxEmpresa = getColIndex(columnAliases.empresa);
        const idxPeso = getColIndex(columnAliases.peso_total_prod);
        const idxCorte = getColIndex(columnAliases.f_ultimo_corte);
        const idxClasif = getColIndex(columnAliases.clasificacion);
        const idxPlaca = getColIndex(columnAliases.placa);
        const idxLong = getColIndex(columnAliases.longitud);
        const idxLat = getColIndex(columnAliases.latitud);

        console.log(`[GRUPO-INTER] Índices detectados: Doc=${idxDoc}, Cliente=${idxClient}, Prod=${idxProd}, Placa=${idxPlaca}`);

        let savedCount = 0;
        let itemsCount = 0;
        let duplicateCount = 0;
        const username = req.body.username || 'System';

        const parseNum = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        const parseExcelDate = (val: any) => {
            if (!val) return null;
            try {
                if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000);
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) { return null; }
        };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const rowArr = rows[i];
            if (!rowArr || rowArr.length === 0) continue; 

            const numero_documento = idxDoc >= 0 ? String(rowArr[idxDoc] || '').trim() : '';
            const producto = idxProd >= 0 ? String(rowArr[idxProd] || '').trim() : 'GENERAL';
            
            if (i < headerRowIndex + 5) {
                console.log(`[GRUPO-INTER] Fila ${i}: Doc='${numero_documento}', Cliente='${idxClient >= 0 ? rowArr[idxClient] : 'N/A'}', Clasif='${idxClasif >= 0 ? rowArr[idxClasif] : 'N/A'}'`);
            }

            if (!numero_documento) continue;

            // 1. Manejo de Cabecera (Búsqueda y Actualización/Inserción)
            let pedidoId: number;
            const existingRes = await pool.query('SELECT id FROM grupo_inter_pedidos WHERE numero_documento = $1', [numero_documento]);
            
            if (existingRes.rows.length > 0) {
                pedidoId = existingRes.rows[0].id;
                await pool.query(`
                    UPDATE grupo_inter_pedidos SET
                        nit = $2, cliente = $3, direccion = $4, notas_encabezado = $5, 
                        municipio_destino = $6, empresa = $7, f_ultimo_corte = $8, 
                        clasificacion = $9, placa = $10, longitud = $11, latitud = $12,
                        update_by = $13, update_at = CURRENT_TIMESTAMP
                    WHERE id = $1;
                `, [
                    pedidoId,
                    idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '',
                    idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '',
                    idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '',
                    idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '',
                    idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '',
                    idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '',
                    idxCorte >= 0 ? parseExcelDate(rowArr[idxCorte]) : null,
                    idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '',
                    idxPlaca >= 0 ? String(rowArr[idxPlaca] || '').trim() : '',
                    parseNum(idxLong >= 0 ? rowArr[idxLong] : null),
                    parseNum(idxLat >= 0 ? rowArr[idxLat] : null),
                    username
                ]);
            } else {
                const insertRes = await pool.query(`
                    INSERT INTO grupo_inter_pedidos (
                        numero_documento, nit, cliente, direccion, notas_encabezado, 
                        municipio_destino, empresa, f_ultimo_corte, 
                        clasificacion, placa, longitud, latitud, estado, create_by, update_by, fecha_carge
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pendiente', $13, $13, CURRENT_TIMESTAMP)
                    RETURNING id;
                `, [
                    numero_documento,
                    idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '',
                    idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '',
                    idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '',
                    idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '',
                    idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '',
                    idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '',
                    idxCorte >= 0 ? parseExcelDate(rowArr[idxCorte]) : null,
                    idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '',
                    idxPlaca >= 0 ? String(rowArr[idxPlaca] || '').trim() : '',
                    parseNum(idxLong >= 0 ? rowArr[idxLong] : null),
                    parseNum(idxLat >= 0 ? rowArr[idxLat] : null),
                    username
                ]);
                pedidoId = insertRes.rows[0].id;
            }
            savedCount++;

            // 1.5 Registro de histórico inicial (Pendiente) si es nuevo o no tiene histórico
            await pool.query(`
                INSERT INTO grupo_inter_pedidos_historico (pedido_id, estado, observacion, usuario)
                SELECT $1, 'Pendiente', 'Carga inicial desde Excel', $2
                WHERE NOT EXISTS (SELECT 1 FROM grupo_inter_pedidos_historico WHERE pedido_id = $1)
            `, [pedidoId, username]);

            // 2. Manejo de Item (Detalle)
            const queryItem = `
                INSERT INTO grupo_inter_pedidos_items (
                    pedido_id, producto, cantidad, precio, peso, tipo_articulo
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            const valuesItem = [
                pedidoId,
                producto,
                parseNum(idxCant >= 0 ? rowArr[idxCant] : 0),
                parseNum(idxPrecio >= 0 ? rowArr[idxPrecio] : 0),
                parseNum(idxPeso >= 0 ? rowArr[idxPeso] : 0),
                idxTipo >= 0 ? String(rowArr[idxTipo] || '').trim() : ''
            ];

            await pool.query(queryItem, valuesItem);
            itemsCount++;

            // 3. Registrar en Histórico (Solo si es nuevo o según lógica)
            // Para evitar saturación, solo si el pedido acaba de crearse o si queremos loguear cada carga
        }

        res.json({ 
            message: `Excel procesado: ${savedCount} facturas actualizadas/creadas con ${itemsCount} items totales`, 
            count: savedCount,
            itemsCount: itemsCount,
            duplicates: duplicateCount 
        });
    } catch (error) {
        console.error('[GRUPO-INTER] Error al subir Excel:', error);
        res.status(500).json({ message: 'Error interno al procesar el Excel' });
    }
};

export const uploadManifestExcel = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No se ha subido ningún archivo' });
            return;
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
            res.status(400).json({ message: 'El archivo está vacío' });
            return;
        }

        const normalize = (val: string) => val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        
        // Buscar encabezados
        let headerRowIndex = -1;
        const aliases = {
            doc: ['DOCUMENTO', 'REMISION', 'PLANILLA', 'PEDIDO', 'NRO DOCUMENTO', 'ORDEN'],
            manifiesto: ['MANIFIESTO', 'NRO MANIFIESTO'],
            planilla: ['NUMERO DE PLANILLA', 'PLANILLA', 'NRO PLANILLA'],
            fecha: ['FECHA DE VIAJE', 'FECHA VIAJE', 'FECHA'],
            ruta: ['RUTA', 'DESTINO', 'VÍA'],
            placa: ['PLACA', 'VEHICULO'],
            flete: ['VALOR FLETE', 'FLETE', 'VALOR'],
            factura: ['NO. FACTURA M7', 'FACTURA M7', 'FACTURA', 'NRO FACTURA']
        };

        const identifyAliases = [...aliases.doc, ...aliases.manifiesto].map(a => normalize(a));
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = (rows[i] || []).map(cell => normalize(String(cell)));
            if (currentRow.some(cell => identifyAliases.some(alias => cell.includes(alias)))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            res.status(400).json({ message: 'Formato complementario no reconocido. Faltan encabezados (Manifiesto, Planilla, etc.)' });
            return;
        }

        const headerRow = (rows[headerRowIndex] || []).map(cell => normalize(String(cell)));
        const getColIndex = (list: string[]) => {
            const normalized = list.map(a => normalize(a));
            return headerRow.findIndex(cell => normalized.some(alias => cell === alias || cell.includes(alias)));
        };

        const idxDoc = getColIndex(aliases.doc);
        const idxMan = getColIndex(aliases.manifiesto);
        const idxPlan = getColIndex(aliases.planilla);
        const idxFecha = getColIndex(aliases.fecha);
        const idxRuta = getColIndex(aliases.ruta);
        const idxPlaca = getColIndex(aliases.placa);
        const idxFlete = getColIndex(aliases.flete);
        const idxFact = getColIndex(aliases.factura);

        if (idxDoc === -1) {
            res.status(400).json({ message: 'No se encontró la columna de referencia (Documento/Remisión)' });
            return;
        }

        let updatedCount = 0;
        const parseNum = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        const parseExcelDate = (val: any) => {
            if (!val) return null;
            try {
                if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000);
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) { return null; }
        };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[idxDoc]) continue;

            const doc = String(row[idxDoc]).trim();
            const manifiesto = idxMan >= 0 ? String(row[idxMan] || '').trim() : '';
            const planilla = idxPlan >= 0 ? String(row[idxPlan] || '').trim() : '';
            const fecha = idxFecha >= 0 ? parseExcelDate(row[idxFecha]) : null;
            const ruta = idxRuta >= 0 ? String(row[idxRuta] || '').trim() : '';
            const placa = idxPlaca >= 0 ? String(row[idxPlaca] || '').trim() : '';
            const flete = idxFlete >= 0 ? parseNum(row[idxFlete]) : 0;
            const factura = idxFact >= 0 ? String(row[idxFact] || '').trim() : '';

            const result = await pool.query(`
                UPDATE grupo_inter_pedidos 
                SET manifiesto = $1, 
                    numero_planilla = $2, 
                    fecha_viaje = $3, 
                    ruta = $4, 
                    placa = COALESCE(NULLIF($5, ''), placa), 
                    valor_flete = $6, 
                    no_factura_m7 = $7,
                    update_at = CURRENT_TIMESTAMP
                WHERE numero_documento = $8
                RETURNING id
            `, [manifiesto, planilla, fecha, ruta, placa, flete, factura, doc]);

            if (result.rowCount && result.rowCount > 0) {
                updatedCount++;
            }
        }

        res.json({ message: `Carga complementaria finalizada. Se actualizaron ${updatedCount} registros.`, count: updatedCount });

    } catch (error) {
        console.error('[GRUPO-INTER] Error en carga complementaria:', error);
        res.status(500).json({ message: 'Error interno al procesar el segundo archivo' });
    }
};

export const processPDF = async (req: any, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No se subió ningún PDF' });
            return;
        }

        const mainPdfDoc = await PDFDocument.load(req.file.buffer);
        const totalPages = mainPdfDoc.getPageCount();

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const sendProgress = (msg: any) => res.write(JSON.stringify(msg) + '\n');
        
        sendProgress({ type: 'start', totalPages });

        const ordersResult = await pool.query("SELECT numero_documento FROM grupo_inter_pedidos WHERE estado != 'Entregado'");
        const pendingDocs = ordersResult.rows.map(r => r.numero_documento);

        if (pendingDocs.length === 0) {
            sendProgress({ type: 'log', message: 'No hay pedidos pendientes para cruzar.' });
            sendProgress({ type: 'end', message: 'Proceso finalizado sin registros pendientes.', matches: 0 });
            res.end();
            return;
        }

        // M7-ATOMIC-OCR: Motor Atómico de Procesamiento Completo (v1.9.30)
        // Reducimos 50 peticiones a solo 1 (1 RPM), garantizando CERO errores de cuota.
        const keys = getAPIKeysPool();
        const apiKey = keys[0]; 
        const modelName = process.env.AI_MODEL || "gemini-1.5-flash";
        let visionModel = getVisionModel(modelName, apiKey);
        
        sendProgress({ type: 'log', message: `🚀 Iniciando Motor Atómico para ${totalPages} páginas...` });
        
        // El PDF completo en Base64
        const fullPdfBase64 = req.file.buffer.toString('base64');

        const prompt = `Actúa como un motor OCR de logística avanzada. 
        Analiza este documento PDF completo de ${totalPages} páginas.
        Tu tarea es identificar en qué página se encuentra cada uno de los siguientes números de documento:
        [${pendingDocs.join(', ')}]
        
        REGLAS:
        1. Escanea todas las páginas del PDF.
        2. Para cada documento encontrado, identifica el NÚMERO DE PÁGINA (1-index).
        3. Responde exclusivamente con un objeto JSON siguiendo este formato:
        {"matches": [{"doc": "NUMERO_DOC", "page": NUM_PAGINA}]}
        4. Si no encuentras ninguno, responde: {"matches": []}
        5. No incluyas texto adicional, solo el JSON.`;

        try {
            const result = await generateContentWithRetry(visionModel, [
                { text: prompt },
                { inlineData: { data: fullPdfBase64, mimeType: "application/pdf" } }
            ], sendProgress, 3);

            const response = await result.response;
            const textResponse = response.text().trim();
            
            // Extraer JSON de la respuesta (por si Gemini incluye markdown)
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Gemini no devolvió un formato JSON válido.");
            
            const data = JSON.parse(jsonMatch[0]);
            const foundMatches = data.matches || [];
            
            sendProgress({ type: 'log', message: `🔍 Gemini detectó ${foundMatches.length} documentos potenciales.` });

            let finalMatches = 0;
            for (const item of foundMatches) {
                const docNum = item.doc;
                const pageIndex = item.page - 1; // Convertir a 0-index

                if (pageIndex >= 0 && pageIndex < totalPages && pendingDocs.includes(docNum)) {
                    sendProgress({ type: 'log', message: `✅ Validando Match: ${docNum} en Pág ${item.page}...` });
                    
                    // Extraer solo la página específica para guardarla como acta
                    const subPdf = await PDFDocument.create();
                    const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [pageIndex]);
                    subPdf.addPage(copiedPage);
                    const base64Page = await subPdf.saveAsBase64();

                    await pool.query(
                        "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', update_at = CURRENT_TIMESTAMP, fecha_entregado = CURRENT_TIMESTAMP WHERE numero_documento = $2",
                        [base64Page, docNum]
                    );

                    // Registrar en histórico
                    const pedRes = await pool.query("SELECT id FROM grupo_inter_pedidos WHERE numero_documento = $1", [docNum]);
                    if (pedRes.rows.length > 0) {
                        await pool.query(
                            "INSERT INTO grupo_inter_pedidos_historico (pedido_id, estado, observacion, usuario) VALUES ($1, 'Entregado', 'PDF Procesado Automáticamente', 'System OCR')",
                            [pedRes.rows[0].id]
                        );
                    }
                    finalMatches++;
                    sendProgress({ type: 'progress', page: item.page, percent: Math.round((finalMatches/foundMatches.length)*100) });
                }
            }

            sendProgress({ type: 'end', message: `Motor Atómico Finalizado.`, matches: finalMatches });
            res.end();
            return;
        } catch (error: any) {
            console.error('[ATOMIC-OCR] Error:', error);
            sendProgress({ type: 'log', message: `❌ Error en el motor atómico: ${error.message}` });
            throw error;
        }
        res.end();
    } catch (error) {
        console.error('[GRUPO-INTER] Error Crítico de Procesamiento:', error);
        res.status(500).json({ message: 'Error interno en el núcleo de paralelización' });
    }
};

export const getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search, status, client, fechaCorteDesde, fechaCorteHasta } = req.query;
        let query = `
            SELECT 
                p.*,
                (SELECT string_agg(DISTINCT i.producto, ', ') FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as producto,
                (SELECT SUM(i.cantidad) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as cantidad_total,
                (SELECT SUM(i.precio) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as precio_total,
                (SELECT SUM(i.peso) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as peso_total_prod,
                (SELECT json_agg(h ORDER BY h.fecha DESC) FROM grupo_inter_pedidos_historico h WHERE h.pedido_id = p.id) as historico
            FROM grupo_inter_pedidos p
            WHERE 1=1
        `;
        const values: any[] = [];
        let paramIdx = 1;

        if (search) {
            query += ` AND (p.numero_documento ILIKE $${paramIdx} OR p.cliente ILIKE $${paramIdx})`;
            values.push(`%${search}%`);
            paramIdx++;
        }
        if (status) {
            query += ` AND p.estado = $${paramIdx}`;
            values.push(status);
            paramIdx++;
        }
        if (client) {
            query += ` AND p.cliente ILIKE $${paramIdx}`;
            values.push(`%${client}%`);
            paramIdx++;
        }
        
        // M7-EXT: Filtro de fecha (Solo si no hay búsqueda global activa)
        if (!search) {
            if (fechaCorteDesde) {
                query += ` AND p.f_ultimo_corte >= $${paramIdx}`;
                values.push(fechaCorteDesde);
                paramIdx++;
            } else {
                // Filtro por defecto de 8 días si no hay nada
                query += ` AND (p.f_ultimo_corte >= CURRENT_DATE - INTERVAL '8 days' OR p.f_ultimo_corte IS NULL)`;
            }

            if (fechaCorteHasta) {
                query += ` AND p.f_ultimo_corte <= $${paramIdx}`;
                values.push(fechaCorteHasta);
                paramIdx++;
            }
        }

        query += ' ORDER BY p.f_ultimo_corte DESC, p.create_at DESC LIMIT 500';
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener pedidos' });
    }
};


export const getOrdersPublicListSecure = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.query.token || req.headers['x-public-token'];
        const MASTER_TOKEN = process.env.PUBLIC_API_TOKEN || 'M7-SECURE-2026-XQW';
        
        if (token !== MASTER_TOKEN) {
            res.status(401).json({ error: 'No autorizado. Token inválido.' });
            return;
        }

        const { fechaDesde, fechaHasta } = req.query;
        let query = `
            SELECT 
                p.*,
                (SELECT string_agg(DISTINCT i.producto, ', ') FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as producto,
                (SELECT SUM(i.cantidad) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as cantidad_total,
                (SELECT SUM(i.precio) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as precio_total,
                (SELECT SUM(i.peso) FROM grupo_inter_pedidos_items i WHERE i.pedido_id = p.id) as peso_total_prod,
                (SELECT json_agg(h ORDER BY h.fecha DESC) FROM grupo_inter_pedidos_historico h WHERE h.pedido_id = p.id) as historico
            FROM grupo_inter_pedidos p
            WHERE 1=1
        `;
        const values: any[] = [];
        let paramIdx = 1;

        // Lógica de fechas (Fct. Último Corte)
        if (fechaDesde) {
            query += ` AND p.f_ultimo_corte >= $${paramIdx}`;
            values.push(fechaDesde);
            paramIdx++;
        }
        if (fechaHasta) {
            query += ` AND p.f_ultimo_corte <= $${paramIdx}`;
            values.push(fechaHasta);
            paramIdx++;
        }

        // M7-EXT: Fallback de 8 días si no hay fechas especificadas
        if (!fechaDesde && !fechaHasta) {
            query += ` AND (p.f_ultimo_corte >= CURRENT_DATE - INTERVAL '8 days' OR p.f_ultimo_corte IS NULL)`;
        }

        query += ' ORDER BY p.f_ultimo_corte DESC, p.create_at DESC LIMIT 1000';
        const result = await pool.query(query, values);

        const mappedOrders = result.rows.map(o => ({
            id: o.id,
            estado: o.estado === 'Entregado' ? 'Entregado' : (o.estado || 'En proceso'),
            nroGuia: o.nro_guia || o.numero_guia || 'PD-' + (o.nro_documento || o.numero_documento),
            nroPedido: o.nro_documento || o.numero_documento,
            fechaEntregado: o.fecha_entregado ? o.fecha_entregado.toISOString().replace('T', ' ').substring(0, 16) : null,
            fctUltimoCorte: o.f_ultimo_corte ? (typeof o.f_ultimo_corte === 'string' ? o.f_ultimo_corte.split('T')[0] : o.f_ultimo_corte.toISOString().split('T')[0]) : null,
            ciudadOrigen: o.ciudad_origen || "MEDELLÍN",
            latitud: parseFloat(o.latitud) || 6.2442,
            longitud: parseFloat(o.longitud) || -75.5812,
            placa: o.placa || 'PENDIENTE',
            cliente: o.cliente,
            direccion: o.direccion,
            municipio_destino: o.municipio_destino || o.ciudad_destino,
            acta_entrega_b64: o.acta_entrega_b64 || null,
            productos: (o.items || []).length > 0 ? o.items : {
                peso: parseFloat(o.peso) || parseFloat(o.peso_total_prod) || 0,
                cantidad: parseInt(o.cantidad) || parseInt(o.cantidad_total) || 0,
                valorDeclarado: parseFloat(o.valor_declarado) || parseFloat(o.precio_total) || 0
            },
            Novedades: (o.historico || []).length > 0 ? o.historico : (o.history || []).map((h: any) => ({
                estado: h.action || h.estado || 'Actualización',
                fechaEstado: h.date || h.fecha || new Date().toISOString()
            }))
        }));

        res.json({
            count: mappedOrders.length,
            orders: mappedOrders
        });
    } catch (error) {
        console.error('[API-PUBLICA-LISTA] Error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { estado, observacion, usuario } = req.body;

        if (!estado) {
            res.status(400).json({ message: 'El estado es requerido' });
            return;
        }

        await pool.query(
            "UPDATE grupo_inter_pedidos SET estado = $1, update_at = CURRENT_TIMESTAMP, update_by = $2 WHERE id = $3",
            [estado, usuario || 'System', id]
        );

        await pool.query(
            "INSERT INTO grupo_inter_pedidos_historico (pedido_id, estado, observacion, usuario) VALUES ($1, $2, $3, $4)",
            [id, estado, observacion || 'Actualización manual', usuario || 'System']
        );

        res.json({ message: 'Estado actualizado correctamente' });
    } catch (error) {
        console.error('[GRUPO-INTER] Error al actualizar estado:', error);
        res.status(500).json({ message: 'Error al actualizar el estado' });
    }
};

export const getOrderDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const itemsRes = await pool.query("SELECT * FROM grupo_inter_pedidos_items WHERE pedido_id = $1", [id]);
        const historyRes = await pool.query("SELECT * FROM grupo_inter_pedidos_historico WHERE pedido_id = $1 ORDER BY fecha DESC", [id]);

        res.json({
            items: itemsRes.rows,
            history: historyRes.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener detalles del pedido' });
    }
};


