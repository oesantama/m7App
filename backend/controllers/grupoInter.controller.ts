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

// Variable para rastrear qué llave estamos usando (Round Robin)
let currentKeyIndex = 0;

// Función para obtener el modelo de visión con inicialización perezosa (Lazy)
const getVisionModel = (modelName?: string, forceApiKey?: string) => {
    const keys = getAPIKeysPool();
    const apiKey = forceApiKey || keys[currentKeyIndex % keys.length] || '';
    
    if (!apiKey) {
        console.error('[OCR-NUCLEAR] ❌ ERROR CRÍTICO: No se detectó ninguna API Key válida en el pool.');
    }
    
    // M7-NUCLEAR-MODEL-FORCE: Forzar 2.0 Flash ya que 1.5 está dando 404 en v1beta
    const modelId = "gemini-2.0-flash"; 
    
    const keyForLog = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
    console.log(`[OCR-NUCLEAR] 🧠 Key [${(currentKeyIndex % keys.length) + 1}/${keys.length}] | Modelo forzado: ${modelId} | Key: ${keyForLog}`);
    
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
        
        let headerRowIndex = -1;
        const columnAliases = {
            numero_documento: ['NUMERO DOCUMENTO', 'NRO DOCUMENTO', 'DOCUMENTO', 'REMISION'],
            nit: ['NIT CLIENTE', 'NIT', 'IDENTIFICACION'],
            cliente: ['NOMBRE CLIENTE', 'CLIENTE', 'RAZON SOCIAL'],
            direccion: ['DIRECCION', 'DIR'],
            notas_encabezado: ['NOTA ENCABEZADO', 'NOTAS', 'OBSERVACIONES'],
            municipio_destino: ['MUNICIPIO DESTINO', 'CIUDAD DESTINO', 'CIUDAD', 'DESTINO', 'DESTINO FINAL'],
            producto: ['PRODUCTO', 'ARTICULO', 'ITEM'],
            cantidad_total: ['CANTIDAD TOTAL', 'CANTIDAD', 'TOTAL'],
            precio_total: ['PRECIO TOTAL', 'PRECIO', 'VALOR'],
            tipo_articulo: ['TIPO ARTICULO', 'TIPO_ARTICULO', 'CATEGORIA ARTICULO'],
            empresa: ['EMPRESA', 'COMPAÑIA'],
            peso_total_prod: ['PESO TOTAL PROD.', 'PESO', 'PESO TOTAL'],
            f_ultimo_corte: ['F. ULTIMO CORTE', 'F ULTIMO CORTE', 'ULTIMO CORTE', 'CORTE'],
            clasificacion: ['CLASIFICACION', 'CATEGORIA', 'TIPO']
        };
        
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = (rows[i] || []).map(cell => normalize(String(cell)));
            if (currentRow.some(cell => cell.includes('NUMERO DOCUMENTO') || cell.includes('CLIENTE'))) {
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
            return headerRow.findIndex(cell => aliases.some(alias => cell === normalize(alias) || cell.includes(normalize(alias))));
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

        let savedCount = 0;
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
            
            if (!numero_documento) continue;

            const exists = await pool.query(
                'SELECT 1 FROM grupo_inter_pedidos WHERE numero_documento = $1 AND producto = $2',
                [numero_documento, producto]
            );

            if (exists.rows.length > 0) continue; 

            const query = `
                INSERT INTO grupo_inter_pedidos (
                    numero_documento, nit, cliente, direccion, notas_encabezado, 
                    municipio_destino, producto, cantidad_total, precio_total, 
                    tipo_articulo, empresa, peso_total_prod, f_ultimo_corte, 
                    clasificacion, estado, create_by, update_by, fecha_carge
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Pendiente', $15, $15, CURRENT_TIMESTAMP)
            `;

            const values = [
                numero_documento,
                idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '',
                idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '',
                idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '',
                idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '',
                idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '',
                producto,
                parseNum(idxCant >= 0 ? rowArr[idxCant] : 0),
                parseNum(idxPrecio >= 0 ? rowArr[idxPrecio] : 0),
                idxTipo >= 0 ? String(rowArr[idxTipo] || '').trim() : '',
                idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '',
                parseNum(idxPeso >= 0 ? rowArr[idxPeso] : 0),
                idxCorte >= 0 ? parseExcelDate(rowArr[idxCorte]) : null,
                idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '',
                username
            ];

            await pool.query(query, values);
            savedCount++;
        }

        res.json({ message: `Excel procesado: ${savedCount} registros nuevos`, count: savedCount });
    } catch (error) {
        console.error('[GRUPO-INTER] Error al subir Excel:', error);
        res.status(500).json({ message: 'Error interno al procesar el Excel' });
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

        // M7-LOAD-BALANCE: Opción A del Usuario
        // División física de páginas por cada API Key del pool
        const keys = getAPIKeysPool();
        const numKeys = keys.length;
        let matches = 0;
        let processedCount = 0;

        // Calcular fragmentos equitativos
        const chunkSize = Math.ceil(totalPages / numKeys);
        
        const worker = async (workerId: number) => {
            const apiKey = keys[workerId];
            if (!apiKey) return;

            let visionModel = getVisionModel("gemini-2.0-flash", apiKey);
            const workerLabel = `[W${workerId + 1}]`;
            const workerContext = { id: workerId, keyIndex: workerId };

            // Rango de páginas asignado a este trabajador
            const startPage = workerId * chunkSize;
            const endPage = Math.min(startPage + chunkSize, totalPages);

            for (let i = startPage; i < endPage; i++) {
                const pageNum = i + 1;
                const subPdf = await PDFDocument.create();
                const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
                subPdf.addPage(copiedPage);
                const base64Page = await subPdf.saveAsBase64();

                try {
                    const prompt = `Actúa como un motor OCR de alta precisión. 
                    Analiza esta factura/remisión. 
                    Busca y extrae exclusivamente el NÚMERO DE DOCUMENTO (Factura No., Remisión No., Guía No.). 
                    Responde SOLO con el número (ej: 123456). 
                    Si no hay, responde "VACIO".`;

                    // M7-THROTTLING: Delay preventivo de 6s por página (10 RPM)
                    // Garantiza que NUNCA se alcancen las 15 RPM de Google
                    if (i > startPage) {
                        await sleep(6100); 
                    }

                    const result = await generateContentWithRetry(visionModel, [
                        { text: prompt }, 
                        { inlineData: { data: base64Page, mimeType: "application/pdf" } }
                    ], sendProgress, 3, workerContext);
                    
                    const response = await result.response;
                    const extractedText = response.text().trim().toUpperCase();
                    const cleanExtracted = extractedText.replace(/[^A-Z0-9]/g, '');

                    if (cleanExtracted && cleanExtracted !== "VACIO") {
                        let pageMatched = false;
                        for (const docNum of pendingDocs) {
                            const cleanDocNum = docNum.replace(/[^A-Z0-9]/g, '').toUpperCase();
                            if (cleanExtracted.includes(cleanDocNum) || cleanDocNum.includes(cleanExtracted)) {
                                pageMatched = true;
                                sendProgress({ type: 'log', message: `✅ ${workerLabel} MATCH: ${docNum} en Pág ${pageNum}` });
                                await pool.query(
                                    "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', update_at = CURRENT_TIMESTAMP, fecha_entregado = CURRENT_TIMESTAMP WHERE numero_documento = $2",
                                    [base64Page, docNum]
                                );
                                matches++;
                            }
                        }
                        if (!pageMatched) {
                            sendProgress({ type: 'log', message: `🔍 ${workerLabel} Pág ${pageNum}: [${extractedText}] (Sin match)` });
                        }
                    } else {
                        sendProgress({ type: 'log', message: `⚠️ ${workerLabel} Pág ${pageNum}: No legible.` });
                    }
                } catch (error: any) {
                    sendProgress({ type: 'log', message: `❌ ${workerLabel} ERROR Pág ${pageNum}: ${error.message}` });
                } finally {
                    processedCount++;
                    sendProgress({ type: 'progress', page: pageNum, percent: Math.round((processedCount/totalPages)*100) });
                }
            }
        };

        // Lanzar los trabajadores en paralelo (cada uno en su franja)
        await Promise.all(Array.from({ length: numKeys }, (_, i) => worker(i)));

        sendProgress({ type: 'end', message: `Procesamiento Equitativo Finalizado.`, matches });
        res.end();
    } catch (error) {
        console.error('[GRUPO-INTER] Error Crítico de Procesamiento:', error);
        res.status(500).json({ message: 'Error interno en el núcleo de paralelización' });
    }
};

export const getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search, status, client, fechaCorteDesde, fechaCorteHasta } = req.query;
        let query = 'SELECT * FROM grupo_inter_pedidos WHERE 1=1';
        const values: any[] = [];

        if (search) {
            values.push(`%${search}%`);
            query += ` AND (numero_documento ILIKE $${values.length} OR cliente ILIKE $${values.length})`;
        }
        if (status) {
            values.push(status);
            query += ` AND estado = $${values.length}`;
        }
        if (client) {
            values.push(`%${client}%`);
            query += ` AND cliente ILIKE $${values.length}`;
        }
        if (fechaCorteDesde) {
            values.push(fechaCorteDesde);
            query += ` AND f_ultimo_corte >= $${values.length}`;
        }
        if (fechaCorteHasta) {
            values.push(fechaCorteHasta);
            query += ` AND f_ultimo_corte <= $${values.length}`;
        }

        query += ' ORDER BY create_at DESC LIMIT 500';
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener pedidos' });
    }
};

export const getOrderPublic = async (req: Request, res: Response): Promise<void> => {
    try {
        const { orderNumber } = req.params;
        const result = await pool.query('SELECT * FROM grupo_inter_pedidos WHERE numero_documento = $1 OR numero_guia = $1', [orderNumber]);

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'No encontrado' });
            return;
        }

        const o = result.rows[0];
        res.json({
            estado: o.estado,
            nroGuia: o.numero_guia,
            fechaEntregado: o.fecha_entregado,
            municipioDestino: o.municipio_destino,
            placa: o.placa,
            actaEntrega: o.acta_entrega_b64 ? `data:image/png;base64,${o.acta_entrega_b64}` : null,
            productos: { peso: o.peso_total_prod, cantidad: o.cantidad_total, precio: o.precio_total },
            Novedades: o.history || []
        });
    } catch (error) {
        res.status(500).json({ message: 'Error interno' });
    }
};

