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
        // [M7-FIX] SOLO ADD IF NOT EXISTS — NUNCA DROP para proteger datos de producción
        await pool.query(`
            -- Asegurar columnas con nombres exactos (idempotente y seguro)
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS create_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS update_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS create_by TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS update_by TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS numero_planilla TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS fecha_viaje TIMESTAMP WITH TIME ZONE;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS no_factura_m7 TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS valor_flete NUMERIC(15,2) DEFAULT 0;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS placa TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS direccion TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS notas_encabezado TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS f_ultimo_corte TIMESTAMP WITH TIME ZONE;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS clasificacion TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS numero_guia TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS latitud NUMERIC;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS longitud NUMERIC;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS ruta TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS cantidad_total NUMERIC DEFAULT 0;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS precio_total NUMERIC DEFAULT 0;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS peso_total_prod NUMERIC DEFAULT 0;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS acta_entrega_b64 TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS fecha_entregado TIMESTAMP WITH TIME ZONE;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS fecha_carge TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS nit TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS empresa TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS municipio_destino TEXT;
            ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS cliente TEXT;
        `);

        // Crear índices para optimizar búsquedas por rango de fecha, placa, planilla y documento
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_fecha_entregado ON grupo_inter_pedidos(fecha_entregado);
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_fecha_carge ON grupo_inter_pedidos(fecha_carge);
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_numero_documento ON grupo_inter_pedidos(numero_documento);
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_f_ultimo_corte ON grupo_inter_pedidos(f_ultimo_corte);
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_placa ON grupo_inter_pedidos(placa);
            CREATE INDEX IF NOT EXISTS idx_grupo_inter_pedidos_numero_planilla ON grupo_inter_pedidos(numero_planilla);
        `);

        // Parche para create_at nulo — seguro porque no borra datos
        await pool.query(`
            UPDATE grupo_inter_pedidos SET create_at = CURRENT_TIMESTAMP WHERE create_at IS NULL;
        `);

        // Tablas auxiliares (CREATE IF NOT EXISTS es idempotente)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS grupo_inter_novedades (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL,
                observacion TEXT,
                fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT
            );

            CREATE TABLE IF NOT EXISTS grupo_inter_reajustes (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                numero_documento TEXT,
                valor NUMERIC(15,2),
                notas TEXT,
                fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT
            );

            CREATE TABLE IF NOT EXISTS grupo_inter_pedidos_items (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                guia TEXT,
                cantidad INTEGER,
                producto TEXT,
                tipo_articulo TEXT,
                peso NUMERIC(10,2),
                valor_declarado NUMERIC(15,2),
                precio NUMERIC(15,2) DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS grupo_inter_pedidos_historico (
                id SERIAL PRIMARY KEY,
                pedido_id INTEGER REFERENCES grupo_inter_pedidos(id) ON DELETE CASCADE,
                estado TEXT,
                observacion TEXT,
                fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT
            );
        `);

        // Columnas adicionales en tablas auxiliares (idempotente)
        await pool.query(`
            ALTER TABLE grupo_inter_pedidos_items ADD COLUMN IF NOT EXISTS tipo_articulo TEXT;
            ALTER TABLE grupo_inter_pedidos_items ADD COLUMN IF NOT EXISTS precio NUMERIC(15,2) DEFAULT 0;
            ALTER TABLE grupo_inter_pedidos_items ADD COLUMN IF NOT EXISTS guia TEXT;
            ALTER TABLE grupo_inter_pedidos_items ADD COLUMN IF NOT EXISTS producto TEXT;
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
    
    // M7-DYNAMIC-MODEL: Forzar fallback estable porque gemini-1.5-flash simple da 404
    const modelId = "gemini-flash-latest"; 
    
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
        if (!req.file || !req.file.path) {
            res.status(400).json({ message: 'No se subió ningún archivo' });
            return;
        }

        const { placa, fleteTotal, planilla } = req.body;
        const fleteTotalNum = parseFloat(fleteTotal) || 0;

        // Leer archivo desde disco
        const fileContent = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileContent, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        let headerRowIndex = -1;
        const columnAliases = {
            numero_documento: ['NUMERO DOCUMENTO', 'NRO DOCUMENTO', 'DOCUMENTO', 'REMISION', 'PEDIDO', 'NRO PEDIDO', 'ORDEN'],
            nit: ['NIT CLIENTE', 'NIT', 'IDENTIFICACION'],
            cliente: ['NOMBRE CLIENTE', 'CLIENTE', 'RAZON SOCIAL'],
            direccion: ['DIRECCION', 'DIRECCION ENTREGA', 'DIR'],
            notas_encabezado: ['NOTA ENCABEZADO', 'NOTAS ENCABEZADO', 'NOTAS', 'OBSERVACIONES', 'OBS'],
            municipio_destino: ['MUNICIPIO', 'CIUDAD', 'DESTINO'],
            producto: ['PRODUCTO', 'ARTICULO', 'DESCRIPCION'],
            cantidad_total: ['CANTIDAD', 'CANT'],
            precio_total: ['PRECIO TOTAL', 'VALOR TOTAL', 'TOTAL', 'SUBTOTAL', 'VALOR DECLARADO'],
            tipo_articulo: ['TIPO ARTICULO', 'CATEGORIA', 'TIPO_ARTICULO', 'TIPO', 'ARTICULO_TIPO'],
            empresa: ['EMPRESA', 'UNIDAD NEGOCIO'],
            peso_total_prod: ['PESO', 'KILOS'],
            f_ultimo_corte: ['FECHA CORTE', 'FCT. ULTIMO CORTE', 'FECHA DE CORTE', 'FC CORTE', 'ULTIMO CORTE', 'FECHA_CORTE'],
            clasificacion: ['CLASIFICACION', 'ABC', 'TIPO PEDIDO', 'SEGMENTO', 'CLASIFICACIÓN']
        };

        const identifyAliases = [...columnAliases.numero_documento, ...columnAliases.cliente].map(a => a.toUpperCase());
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = (rows[i] || []).map(cell => String(cell || '').toUpperCase());
            if (currentRow.some(cell => identifyAliases.some(alias => cell.includes(alias)))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            res.status(400).json({ message: 'No se detectaron los encabezados en el Excel.' });
            return;
        }

        const headerRow = (rows[headerRowIndex] || []).map(cell => String(cell || '').toUpperCase().trim());
        const getColIndex = (list: string[]) => {
            // Primero buscar coincidencia exacta
            const exact = headerRow.findIndex(cell => list.some(alias => cell === alias));
            if (exact >= 0) return exact;
            // Luego coincidencia parcial (si no hay exacta)
            return headerRow.findIndex(cell => list.some(alias => cell.includes(alias)));
        };

        const idxDoc = getColIndex(columnAliases.numero_documento);
        const idxPrice = getColIndex(columnAliases.precio_total);
        // ... otros índices ...
        const idxNit = getColIndex(columnAliases.nit);
        const idxClient = getColIndex(columnAliases.cliente);
        const idxDir = getColIndex(columnAliases.direccion);
        const idxNota = getColIndex(columnAliases.notas_encabezado);
        const idxDest = getColIndex(columnAliases.municipio_destino);
        const idxProd = getColIndex(columnAliases.producto);
        const idxCant = getColIndex(columnAliases.cantidad_total);
        const idxTipo = getColIndex(columnAliases.tipo_articulo);
        const idxEmpresa = getColIndex(columnAliases.empresa);
        const idxPeso = getColIndex(columnAliases.peso_total_prod);
        const idxCorte = getColIndex(columnAliases.f_ultimo_corte);
        const idxClasif = getColIndex(columnAliases.clasificacion);

        const parseNum = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        const parseCoord = (val: any) => {
            if (val === undefined || val === null || val === '' || val === ' ') return null;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            const num = parseFloat(clean);
            return isNaN(num) ? null : num;
        };

        const parseExcelDate = (val: any) => {
            if (!val) return null;
            try {
                if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000);
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) { return null; }
        };

        // 🟢 FASE 1: Calcular Precio Total del Batch para prorrata
        let totalBatchPrice = 0;
        const docsPriceMap: Record<string, number> = {};
        const rowsToProcess: any[] = [];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const rowArr = rows[i];
            if (!rowArr || rowArr.length === 0) continue;
            const doc = idxDoc >= 0 ? String(rowArr[idxDoc] || '').trim() : '';
            if (!doc) continue;
            
            const price = idxPrice >= 0 ? parseNum(rowArr[idxPrice]) : 0;
            totalBatchPrice += price;
            docsPriceMap[doc] = (docsPriceMap[doc] || 0) + price;
            rowsToProcess.push({ rowIndex: i, rowArr, doc, price });
        }

        // 🟠 FASE 2: Procesar cada factura con su flete porcentual
        let savedCount = 0;
        const processedDocs = new Set<string>();
        const username = req.body.username || 'System';

        for (const item of rowsToProcess) {
            const { doc, rowArr } = item;
            
            if (!processedDocs.has(doc)) {
                const docTotal = docsPriceMap[doc] || 0;
                // Regla de 3 para el flete: (FleteTotal * PrecioFactura) / PrecioTotalBatch
                const fleteProporcional = totalBatchPrice > 0 ? (fleteTotalNum * docTotal) / totalBatchPrice : 0;

                const existingRes = await pool.query('SELECT id FROM grupo_inter_pedidos WHERE numero_documento = $1', [doc]);
                let pedidoId: number;

                const excelCorteDate = idxCorte >= 0 ? parseExcelDate(rowArr[idxCorte]) : null;

                if (existingRes.rows.length > 0) {
                    pedidoId = existingRes.rows[0].id;
                    await pool.query(`
                        UPDATE grupo_inter_pedidos SET
                            nit = $2, cliente = $3, direccion = $4, notas_encabezado = $5, 
                            municipio_destino = $6, empresa = $7, f_ultimo_corte = COALESCE($8, f_ultimo_corte, CURRENT_TIMESTAMP), 
                            clasificacion = $9, placa = $10, valor_flete = $11, numero_planilla = $12,
                            cantidad_total = $13, precio_total = $14, peso_total_prod = $15,
                            update_by = $16, update_at = CURRENT_TIMESTAMP
                        WHERE id = $1;
                    `, [
                        pedidoId,
                        idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '',
                        idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '',
                        idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '',
                        idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '',
                        idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '',
                        idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '',
                        excelCorteDate,
                        idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '',
                        placa,
                        fleteProporcional,
                        planilla || '',
                        idxCant >= 0 ? parseNum(rowArr[idxCant]) : 0,
                        idxPrice >= 0 ? parseNum(rowArr[idxPrice]) : 0,
                        idxPeso >= 0 ? parseNum(rowArr[idxPeso]) : 0,
                        username
                    ]);
                } else {
                    const insertRes = await pool.query(`
                        INSERT INTO grupo_inter_pedidos (
                            numero_documento, nit, cliente, direccion, notas_encabezado, 
                            municipio_destino, empresa, f_ultimo_corte, 
                            clasificacion, placa, valor_flete, numero_planilla, 
                            cantidad_total, precio_total, peso_total_prod,
                            estado, create_by, create_at, fecha_carge
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_TIMESTAMP), $9, $10, $11, $12, $13, $14, $15, 'Pendiente', $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING id;
                    `, [
                        doc,
                        idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '',
                        idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '',
                        idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '',
                        idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '',
                        idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '',
                        idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '',
                        excelCorteDate,
                        idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '',
                        placa,
                        fleteProporcional,
                        planilla || '',
                        idxCant >= 0 ? parseNum(rowArr[idxCant]) : 0,
                        idxPrice >= 0 ? parseNum(rowArr[idxPrice]) : 0,
                        idxPeso >= 0 ? parseNum(rowArr[idxPeso]) : 0,
                        username
                    ]);
                    pedidoId = insertRes.rows[0].id;

                    await pool.query(`
                        INSERT INTO grupo_inter_pedidos_historico (pedido_id, estado, observacion, usuario)
                        VALUES ($1, 'Pendiente', 'Carga inicial valorizada', $2)
                    `, [pedidoId, username]);
                }
                processedDocs.add(doc);
                savedCount++;
            }

            // Insertar items siempre
            const pedidoIdForItems = (await pool.query('SELECT id FROM grupo_inter_pedidos WHERE numero_documento = $1', [doc])).rows[0].id;
            await pool.query(`
                INSERT INTO grupo_inter_pedidos_items (pedido_id, producto, cantidad, precio, peso, tipo_articulo)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                pedidoIdForItems,
                idxProd >= 0 ? String(rowArr[idxProd] || '').trim() : 'GENERAL',
                parseNum(idxCant >= 0 ? rowArr[idxCant] : 0),
                parseNum(idxPrice >= 0 ? rowArr[idxPrice] : 0),
                parseNum(idxPeso >= 0 ? rowArr[idxPeso] : 0),
                idxTipo >= 0 ? String(rowArr[idxTipo] || '').trim() : ''
            ]);
        }

        res.json({ message: `Excel procesado: ${savedCount} facturas sincronizadas. Flete total distribuido: $${fleteTotalNum.toLocaleString()}`, count: savedCount });
    } catch (error) {
        console.error('[GRUPO-INTER] Error al subir Excel:', error);
        res.status(500).json({ message: 'Error interno al procesar el Excel' });
    } finally {
        // Limpieza de archivo temporal
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('[GRUPO-INTER] Error borrando temporal Excel:', err);
            });
        }
    }
};

export const uploadManifestExcel = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file || !req.file.path) {
            res.status(400).json({ message: 'No se ha subido ningún archivo' });
            return;
        }

        const fileContent = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileContent, { type: 'buffer' });
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
            factura: ['NO. FACTURA M7', 'FACTURA M7', 'FACTURA', 'NRO FACTURA'],
            latitud: ['LATITUD', 'LAT', 'COORDINADA Y'],
            longitud: ['LONGITUD', 'LON', 'COORDINADA X', 'LNG']
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
        const idxLat = getColIndex(aliases.latitud);
        const idxLon = getColIndex(aliases.longitud);

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

        const parseCoord = (val: any) => {
            if (val === undefined || val === null || val === '' || val === ' ') return null;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            const num = parseFloat(clean);
            return isNaN(num) ? null : num;
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

            const latitud = idxLat >= 0 ? parseCoord(row[idxLat]) : null;
            const longitud = idxLon >= 0 ? parseCoord(row[idxLon]) : null;

            const result = await pool.query(`
                UPDATE grupo_inter_pedidos 
                SET numero_guia = $1, 
                    numero_planilla = $2, 
                    fecha_viaje = $3, 
                    ruta = $4, 
                    placa = COALESCE(NULLIF($5, ''), placa), 
                    valor_flete = $6, 
                    no_factura_m7 = $7,
                    latitud = COALESCE($8, latitud),
                    longitud = COALESCE($9, longitud),
                    update_at = CURRENT_TIMESTAMP
                WHERE numero_documento = $10
                RETURNING id
            `, [manifiesto, planilla, fecha, ruta, placa, flete, factura, latitud, longitud, doc]);

            if (result.rowCount && result.rowCount > 0) {
                updatedCount++;
            }
        }
        res.json({ message: `Complemento procesado: ${updatedCount} facturas actualizadas.` });
    } catch (error) {
        console.error('[GRUPO-INTER] Error en carga complementaria:', error);
        res.status(500).json({ message: 'Error interno al procesar el segundo archivo' });
    } finally {
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('[GRUPO-INTER] Error borrando temporal Manifest:', err);
            });
        }
    }
};




export const processPDF = async (req: any, res: Response): Promise<void> => {
    try {
        if (!req.file || !req.file.path) {
            res.status(400).json({ message: 'No se subió ningún PDF' });
            return;
        }

        const fileContent = fs.readFileSync(req.file.path);
        const mainPdfDoc = await PDFDocument.load(fileContent);
        const totalPages = mainPdfDoc.getPageCount();

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const sendProgress = (msg: any) => res.write(JSON.stringify(msg) + '\n');
        
        sendProgress({ type: 'start', totalPages });

        const ordersResult = await pool.query("SELECT numero_documento, no_factura_m7 FROM grupo_inter_pedidos WHERE estado != 'Entregado'");
        const pendingRows = ordersResult.rows;

        if (pendingRows.length === 0) {
            sendProgress({ type: 'log', message: 'No hay pedidos pendientes para cruzar.' });
            sendProgress({ type: 'end', message: 'Proceso finalizado sin registros pendientes.', matches: 0 });
            res.end();
            return;
        }

        // M7-ATOMIC-OCR: Motor Atómico Numérico Exclusivo (v1.9.31)
        // Extraemos solo la parte numérica de los pedidos porque el PDF puede traerlos sin letras o con otras letras (ej. TR-GENI vs TI)
        const numericDocsMap = new Map<string, string>();
        for (const row of pendingRows) {
            if (row.numero_documento) {
                const numPartDoc = String(row.numero_documento).replace(/\D/g, '');
                if (numPartDoc) numericDocsMap.set(numPartDoc, row.numero_documento);
            }
            if (row.no_factura_m7) {
                const numPartFac = String(row.no_factura_m7).replace(/\D/g, '');
                if (numPartFac) numericDocsMap.set(numPartFac, row.numero_documento);
            }
        }
        const numericList = Array.from(numericDocsMap.keys());

        if (numericList.length === 0) {
            sendProgress({ type: 'log', message: 'No hay pedidos con formato numérico.' });
            sendProgress({ type: 'end', message: 'No hay pedidos válidos para analizar.', matches: 0 });
            res.end();
            return;
        }

        const keys = getAPIKeysPool();
        const apiKey = keys[0]; 
        const modelName = process.env.AI_MODEL || "gemini-flash-latest";
        let visionModel = getVisionModel(modelName, apiKey);
        
        sendProgress({ type: 'log', message: `🚀 Iniciando Motor Atómico PÁGINA POR PÁGINA para ${totalPages} páginas...` });
        
        let finalMatches = 0;
        const username = req.body.username || 'System OCR';

        for (let i = 0; i < totalPages; i++) {
            sendProgress({ type: 'log', message: `Analizando página ${i + 1} de ${totalPages}...` });
            
            const subPdf = await PDFDocument.create();
            const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
            subPdf.addPage(copiedPage);
            const pageBase64 = await subPdf.saveAsBase64();

            const prompt = `Actúa como un motor OCR de logística. 
            Analiza esta página PDF.
            Busca EXCLUSIVAMENTE las siguientes secuencias numéricas (ignora prefijos como 'FEV', 'FV', o cualquier otra letra alrededor):
            [${numericList.join(', ')}]
            
            REGLAS:
            1. Escanea la página.
            2. Si encuentras un número que coincida EXACTAMENTE con uno de la lista (ignorando letras), inclúyelo en la lista "matches".
            3. Responde SOLO con un JSON estricto con esta estructura exacta:
            {"matches": ["NUMERO_1", "NUMERO_2"]}
            4. Si no hay coincidencias, responde: {"matches": []}
            5. Prohibido agregar formato markdown o texto adicional, solo el JSON raw.`;

            try {
                const result = await generateContentWithRetry(visionModel, [
                    { text: prompt },
                    { inlineData: { data: pageBase64, mimeType: "application/pdf" } }
                ], sendProgress, 3);

                const response = await result.response;
                const textResponse = response.text().trim();
                
                const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    sendProgress({ type: 'log', message: `⚠️ Página ${i + 1}: Respuesta inválida del modelo.` });
                    continue;
                }
                
                const data = JSON.parse(jsonMatch[0]);
                const foundMatchesInPage = data.matches || [];

                for (const item of foundMatchesInPage) {
                    const matchedNum = String(item).replace(/\D/g, '');
                    const originalDocId = numericDocsMap.get(matchedNum);

                    if (originalDocId) {
                        sendProgress({ type: 'log', message: `✅ Match exacto: ${originalDocId} (encontrado como ${matchedNum}) en Pág ${i + 1}...` });
                        
                        const base64PagePrefix = `data:application/pdf;base64,${pageBase64}`;

                        await pool.query(
                            "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', update_at = CURRENT_TIMESTAMP, update_by = $2, fecha_entregado = CURRENT_TIMESTAMP WHERE numero_documento = $3",
                            [base64PagePrefix, username, originalDocId]
                        );

                        // Registrar en histórico
                        const pedRes = await pool.query("SELECT id FROM grupo_inter_pedidos WHERE numero_documento = $1", [originalDocId]);
                        if (pedRes.rows.length > 0) {
                            await pool.query(
                                "INSERT INTO grupo_inter_pedidos_historico (pedido_id, estado, observacion, usuario) VALUES ($1, 'Entregado', 'PDF Procesado Automáticamente', 'System OCR')",
                                [pedRes.rows[0].id]
                            );
                        }
                        
                        // Remover de la lista pendiente para no volver a buscarlo y acelerar el proceso
                        const idx = numericList.indexOf(matchedNum);
                        if (idx > -1) numericList.splice(idx, 1);
                        
                        finalMatches++;
                    }
                }
            } catch (pageError) {
                sendProgress({ type: 'log', message: `❌ Error al procesar la página ${i + 1}. Omitiendo...` });
                console.error(`Error en página ${i + 1}:`, pageError);
            }
            
            // Emit progress
            sendProgress({ type: 'progress', page: i + 1, percent: Math.round(((i + 1) / totalPages) * 100) });
        }

        sendProgress({ type: 'end', message: `Motor Atómico Finalizado.`, matches: finalMatches });
        res.end();
        return;
    } catch (error) {
        console.error('[GRUPO-INTER] Error Crítico de Procesamiento:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error interno en el núcleo de paralelización' });
        } else {
            res.write(JSON.stringify({ type: 'end', message: 'Fallo interno crítico', matches: 0 }) + '\n');
            res.end();
        }
    } finally {
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('[GRUPO-INTER] Error borrando temporal PDF:', err);
            });
        }
    }
};

export const getOrders = async (req: Request, res: Response): Promise<void> => {
    await ensureSchema();
    const dbClient = await pool.connect();
    try {
        // [M7-PERF] Timeout de seguridad: si la query tarda más de 20s, devolvemos error controlado
        await dbClient.query(`SET LOCAL statement_timeout = '20000'`);

        const { search, status, client, fechaCorteDesde, fechaCorteHasta, invoice, plate, planilla, dateType } = req.query;
        const values: any[] = [];
        let paramIdx = 1;

        // Filtros de la cláusula WHERE
        const whereClauses: string[] = ['1=1'];

        if (search) {
            whereClauses.push(`(
                p.numero_documento ILIKE $${paramIdx} OR
                p.cliente ILIKE $${paramIdx} OR
                p.nit ILIKE $${paramIdx} OR
                p.numero_planilla ILIKE $${paramIdx} OR
                p.placa ILIKE $${paramIdx} OR
                p.municipio_destino ILIKE $${paramIdx} OR
                p.estado ILIKE $${paramIdx} OR
                p.no_factura_m7 ILIKE $${paramIdx}
            )`);
            values.push(`%${String(search).trim()}%`);
            paramIdx++;
        }

        // El input factura debe buscar por numero_documento (Documento en la tabla) o por no_factura_m7
        if (invoice) {
            whereClauses.push(`(p.numero_documento ILIKE $${paramIdx} OR p.no_factura_m7 ILIKE $${paramIdx})`);
            values.push(`%${invoice}%`);
            paramIdx++;
        }
        if (plate) {
            whereClauses.push(`p.placa ILIKE $${paramIdx}`);
            values.push(`%${plate}%`);
            paramIdx++;
        }
        if (planilla) {
            whereClauses.push(`p.numero_planilla ILIKE $${paramIdx}`);
            values.push(`%${planilla}%`);
            paramIdx++;
        }

        if (status) {
            whereClauses.push(`p.estado = $${paramIdx}`);
            values.push(status);
            paramIdx++;
        }
        if (client) {
            whereClauses.push(`p.cliente ILIKE $${paramIdx}`);
            values.push(`%${client}%`);
            paramIdx++;
        }

        // Selección dinámica de la columna de fecha para búsquedas ultra optimizadas por índice
        const dateCol = dateType === 'cargue' ? 'p.fecha_carge' : 'p.fecha_entregado';

        // Filtro de fecha combinado con otros inputs (AND)
        if (fechaCorteDesde && fechaCorteHasta) {
            whereClauses.push(`${dateCol} >= $${paramIdx}::date`);
            whereClauses.push(`${dateCol} < ($${paramIdx + 1}::date + INTERVAL '1 day')`);
            values.push(fechaCorteDesde, fechaCorteHasta);
            paramIdx += 2;
        } else if (fechaCorteDesde) {
            whereClauses.push(`${dateCol} >= $${paramIdx}::date`);
            values.push(fechaCorteDesde);
            paramIdx++;
        } else if (fechaCorteHasta) {
            whereClauses.push(`${dateCol} < ($${paramIdx}::date + INTERVAL '1 day')`);
            values.push(fechaCorteHasta);
            paramIdx++;
        } else if (!search && !invoice && !plate && !planilla) {
            // Rango por defecto: usar fecha_carge (siempre tiene valor) para evitar full scan
            whereClauses.push(`(p.fecha_carge >= CURRENT_DATE - INTERVAL '30 days')`);
        }

        const whereStr = whereClauses.join(' AND ');

        // Ordenar por la columna filtrada para maximizar el uso del índice
        const orderCol = dateType === 'cargue' ? 'p.fecha_carge' : 'p.fecha_carge';

        const query = `
            WITH pedidos_filtrados AS (
                SELECT p.*
                FROM grupo_inter_pedidos p
                WHERE ${whereStr}
                ORDER BY ${orderCol} DESC NULLS LAST, p.create_at DESC
                LIMIT 500
            ),
            items_agg AS (
                SELECT i.pedido_id AS pid,
                       string_agg(DISTINCT i.producto, ', ') AS producto
                FROM grupo_inter_pedidos_items i
                WHERE i.pedido_id IN (SELECT id FROM pedidos_filtrados)
                GROUP BY i.pedido_id
            ),
            historico_agg AS (
                SELECT h.pedido_id AS pid,
                       json_agg(h ORDER BY h.fecha DESC) AS historico
                FROM grupo_inter_pedidos_historico h
                WHERE h.pedido_id IN (SELECT id FROM pedidos_filtrados)
                GROUP BY h.pedido_id
            )
            SELECT pf.*,
                   ia.producto,
                   ha.historico
            FROM pedidos_filtrados pf
            LEFT JOIN items_agg      ia ON ia.pid = pf.id
            LEFT JOIN historico_agg  ha ON ha.pid = pf.id
            ORDER BY pf.fecha_carge DESC NULLS LAST, pf.create_at DESC
        `;

        const result = await dbClient.query(query, values);
        res.json(result.rows);
    } catch (error: any) {
        console.error('[M7-ERR] getOrders:', error?.message || error);
        if (error?.message?.includes('canceling statement due to statement timeout')) {
            res.status(504).json({ message: 'La consulta tardó demasiado. Por favor reduce el rango de fechas e intenta de nuevo.' });
        } else {
            res.status(500).json({ message: 'Error al obtener pedidos', detail: error?.message });
        }
    } finally {
        dbClient.release();
    }
};


// --- EXPORTACIÓN PÚBLICA ---
export const getOrdersPublicListSecure = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.query.token || req.headers['x-public-token'];
        const MASTER_TOKEN = process.env.PUBLIC_API_TOKEN || 'M7-SECURE-2026-XQW';

        if (token !== MASTER_TOKEN) {
            res.status(401).json({
                ok: false,
                codigo: 'TOKEN_INVALIDO',
                mensaje: 'Acceso denegado. El token proporcionado no es válido.',
                ayuda: 'Verifique que el parámetro ?token= o el header X-Public-Token sea correcto.'
            });
            return;
        }

        const { fechaDesde, fechaHasta, nroDocumento } = req.query;

        // ── Validación de rango de fechas (máximo 60 días) ───────────────────
        const MAX_DAYS = 60;
        let desde: Date;
        let hasta: Date;

        if (!nroDocumento) {
            hasta  = fechaHasta  ? new Date(String(fechaHasta))  : new Date();
            desde  = fechaDesde  ? new Date(String(fechaDesde))  : (() => {
                const d = new Date(hasta);
                d.setDate(d.getDate() - 30);
                return d;
            })();

            if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
                res.status(400).json({
                    ok: false,
                    codigo: 'FECHA_INVALIDA',
                    mensaje: 'Una o ambas fechas tienen un formato incorrecto.',
                    ayuda: 'Use el formato YYYY-MM-DD. Ejemplo: fechaDesde=2026-01-01&fechaHasta=2026-03-01'
                });
                return;
            }

            const diffDays = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                res.status(400).json({
                    ok: false,
                    codigo: 'RANGO_INVALIDO',
                    mensaje: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
                    detalle: {
                        fechaDesde: desde.toISOString().split('T')[0],
                        fechaHasta: hasta.toISOString().split('T')[0]
                    },
                    ayuda: 'Verifique que fechaDesde sea anterior o igual a fechaHasta.'
                });
                return;
            }
            if (diffDays > MAX_DAYS) {
                res.status(400).json({
                    ok: false,
                    codigo: 'RANGO_EXCEDIDO',
                    mensaje: `El rango de fechas supera el máximo permitido de ${MAX_DAYS} días.`,
                    detalle: {
                        diasSolicitados: diffDays,
                        diasPermitidos: MAX_DAYS,
                        fechaDesde: desde.toISOString().split('T')[0],
                        fechaHasta: hasta.toISOString().split('T')[0]
                    },
                    ayuda: `Divida la consulta en períodos de máximo ${MAX_DAYS} días. Ejemplo: consulte enero por separado de febrero.`
                });
                return;
            }
        }

        // ── Construcción de filtros para el CTE base ─────────────────────────
        const values: any[] = [];
        let paramIdx = 1;
        const pedidoFilters: string[] = ['1=1'];

        if (nroDocumento) {
            pedidoFilters.push(`p.numero_documento = $${paramIdx}`);
            values.push(String(nroDocumento));
            paramIdx++;
        } else {
            pedidoFilters.push(`p.f_ultimo_corte >= $${paramIdx}`);
            values.push(desde!.toISOString().split('T')[0]);
            paramIdx++;

            pedidoFilters.push(`p.f_ultimo_corte <= $${paramIdx}`);
            values.push(hasta!.toISOString().split('T')[0]);
            paramIdx++;
        }

        // ── Query optimizada con CTE: 1 scan por tabla relacionada en vez de N×4 subqueries ─
        // Antes: por cada fila devuelta se ejecutaban 4 subqueries correlacionadas.
        // Ahora: se filtran los pedidos primero (CTE), luego se agregan las tablas
        // relacionadas en 4 scans únicos usando IN (lista de ids del CTE).
        const query = `
            WITH pedidos_filtrados AS (
                SELECT p.*
                FROM grupo_inter_pedidos p
                WHERE ${pedidoFilters.join(' AND ')}
                ORDER BY p.f_ultimo_corte DESC, p.create_at DESC
                LIMIT 1000
            ),
            novedades_agg AS (
                SELECT
                    n.pedido_id::TEXT AS pid,
                    json_agg(json_build_object(
                        'tipo',        n.tipo,
                        'observacion', n.observacion,
                        'fecha',       n.fecha,
                        'usuario',     n.usuario
                    ) ORDER BY n.fecha DESC) AS novedades_arr
                FROM grupo_inter_novedades n
                WHERE n.pedido_id::TEXT IN (SELECT id::TEXT FROM pedidos_filtrados)
                GROUP BY n.pedido_id
            ),
            reajustes_agg AS (
                SELECT
                    r.pedido_id::TEXT AS pid,
                    json_agg(json_build_object(
                        'valor',   r.valor,
                        'notas',   r.notas,
                        'fecha',   r.fecha,
                        'usuario', r.usuario
                    ) ORDER BY r.fecha DESC) AS reajustes_arr
                FROM grupo_inter_reajustes r
                WHERE r.pedido_id::TEXT IN (SELECT id::TEXT FROM pedidos_filtrados)
                GROUP BY r.pedido_id
            ),
            items_agg AS (
                SELECT
                    i.pedido_id::TEXT AS pid,
                    json_agg(i ORDER BY i.id ASC) AS items_arr
                FROM grupo_inter_pedidos_items i
                WHERE i.pedido_id::TEXT IN (SELECT id::TEXT FROM pedidos_filtrados)
                GROUP BY i.pedido_id
            ),
            historico_agg AS (
                SELECT
                    h.pedido_id::TEXT AS pid,
                    json_agg(h ORDER BY h.fecha DESC) AS historico_arr
                FROM grupo_inter_pedidos_historico h
                WHERE h.pedido_id::TEXT IN (SELECT id::TEXT FROM pedidos_filtrados)
                GROUP BY h.pedido_id
            )
            SELECT
                p.*,
                n.novedades_arr,
                r.reajustes_arr,
                i.items_arr,
                h.historico_arr
            FROM pedidos_filtrados p
            LEFT JOIN novedades_agg  n ON n.pid = p.id::TEXT
            LEFT JOIN reajustes_agg  r ON r.pid = p.id::TEXT
            LEFT JOIN items_agg      i ON i.pid = p.id::TEXT
            LEFT JOIN historico_agg  h ON h.pid = p.id::TEXT
            ORDER BY p.f_ultimo_corte DESC, p.create_at DESC
        `;

        // Timeout de seguridad a nivel de sesión: 30 s
        const client = await pool.connect();
        let result: any;
        try {
            await client.query("SET LOCAL statement_timeout = '30000'");
            result = await client.query(query, values);
        } finally {
            client.release();
        }

        const mappedOrders = result.rows.map((o: any) => ({
            id: o.id,
            estado: o.estado === 'Entregado' ? 'Entregado' : (o.estado || 'En proceso'),
            nroGuia: o.numero_guia || 'PD-' + o.numero_documento,
            nroPedido: o.numero_documento,
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
            valorFlete: Math.round(parseFloat(o.valor_flete) || 0),
            productos: (o.items_arr || []).length > 0 ? o.items_arr : {
                peso: parseFloat(o.peso_total_prod) || 0,
                cantidad: parseInt(o.cantidad_total) || 0,
                valorDeclarado: parseFloat(o.precio_total) || 0
            },
            novedades: o.novedades_arr || [],
            reajustes: o.reajustes_arr || [],
            historicos: o.historico_arr || [],
            Novedades: (o.historico_arr || []).length > 0 ? o.historico_arr : []
        }));

        res.json({
            ok: true,
            consulta: {
                tipo: nroDocumento ? 'por_documento' : 'por_rango_fecha',
                ...(nroDocumento
                    ? { nroDocumento: String(nroDocumento) }
                    : {
                        fechaDesde: desde!.toISOString().split('T')[0],
                        fechaHasta: hasta!.toISOString().split('T')[0],
                        diasConsultados: Math.ceil((hasta!.getTime() - desde!.getTime()) / (1000 * 60 * 60 * 24))
                    }
                )
            },
            resumen: {
                totalRegistros: mappedOrders.length,
                entregados:     mappedOrders.filter(o => o.estado === 'Entregado').length,
                enProceso:      mappedOrders.filter(o => o.estado !== 'Entregado').length
            },
            pedidos: mappedOrders
        });
    } catch (error: any) {
        console.error('[API-PUBLICA-LISTA] Error:', error);
        if (error.code === '57014') {
            res.status(504).json({
                ok: false,
                codigo: 'TIMEOUT_CONSULTA',
                mensaje: 'La consulta excedió el tiempo máximo de respuesta del servidor.',
                ayuda: 'Intente con un rango de fechas más corto (máximo 60 días).'
            });
        } else {
            res.status(500).json({
                ok: false,
                codigo: 'ERROR_INTERNO',
                mensaje: 'Ocurrió un error inesperado en el servidor.',
                ayuda: 'Si el problema persiste, contacte al administrador del sistema.'
            });
        }
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
        const novedadesRes = await pool.query("SELECT * FROM grupo_inter_novedades WHERE pedido_id = $1 ORDER BY fecha DESC", [id]);
        const reajustesRes = await pool.query("SELECT * FROM grupo_inter_reajustes WHERE pedido_id = $1 ORDER BY fecha DESC", [id]);

        res.json({
            items: itemsRes.rows,
            history: historyRes.rows,
            novedades: novedadesRes.rows,
            reajustes: reajustesRes.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener detalles del pedido' });
    }
};
export const getNovedades = async (req: Request, res: Response): Promise<void> => {
    try {
        const { pedido_id } = req.params;
        const result = await pool.query("SELECT * FROM grupo_inter_novedades WHERE pedido_id = $1 ORDER BY fecha DESC", [pedido_id]);
        res.json(result.rows || []);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener novedades' });
    }
};

export const addNovedad = async (req: Request, res: Response): Promise<void> => {
    try {
        const { pedido_id, novedad, observacion, usuario } = req.body;
        // Soportamos 'novedad' por compatibilidad, pero preferimos 'observacion' que es el nombre en DB
        const obsFinal = observacion || novedad;

        if (!obsFinal) {
            res.status(400).json({ message: 'La observación es requerida' });
            return;
        }

        await pool.query(
            "INSERT INTO grupo_inter_novedades (pedido_id, tipo, observacion, usuario) VALUES ($1, 'NOVEDAD', $2, $3)",
            [pedido_id, obsFinal, usuario || 'System']
        );
        res.json({ message: 'Novedad registrada con éxito' });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar novedad' });
    }
};

export const getReajustes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { pedido_id } = req.params;
        const result = await pool.query("SELECT * FROM grupo_inter_reajustes WHERE pedido_id = $1 ORDER BY fecha DESC", [pedido_id]);
        res.json(result.rows || []);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener reajustes' });
    }
};

export const addReajuste = async (req: Request, res: Response): Promise<void> => {
    try {
        const { pedido_id, valor, notas, usuario } = req.body;
        const pedidoRes = await pool.query("SELECT numero_documento FROM grupo_inter_pedidos WHERE id = $1", [pedido_id]);
        const doc = pedidoRes.rows[0]?.numero_documento || 'N/A';
        
        await pool.query(
            "INSERT INTO grupo_inter_reajustes (pedido_id, numero_documento, valor, notas, usuario) VALUES ($1, $2, $3, $4, $5)",
            [pedido_id, doc, valor, notas, usuario || 'System']
        );
        res.json({ message: 'Reajuste registrado con éxito' });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar reajuste' });
    }
};
