import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const getVisionModel = (name?: string) => {
    // Usar modelos confirmados por el sistema para evitar 404
    const modelId = name || process.env.AI_MODEL || "gemini-2.0-flash";
    return genAI.getGenerativeModel({ model: modelId });
};

let visionModel = getVisionModel();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(model: any, promptData: any, sendProgress: (msg: any) => void, maxRetries = 10) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await model.generateContent(promptData);
            return result;
        } catch (error: any) {
            const errorStr = error.toString() + (error.message || '');
            const isQuotaError = errorStr.includes('429') || error.status === 429 || errorStr.toLowerCase().includes('quota');
            
            if (isQuotaError && i < maxRetries - 1) {
                // Intentar extraer el tiempo de espera del mensaje de error
                let waitSeconds = 0;
                // Regex mejorado para capturar "54.5s", "54s", "54 seconds", "1000ms", etc.
                const match = errorStr.match(/retry in ([\d.]+)\s*(s|ms|seconds?|milliseconds?)/i);
                
                if (match) {
                    waitSeconds = parseFloat(match[1]);
                    const unit = match[2].toLowerCase();
                    if (unit.startsWith('m')) waitSeconds /= 1000;
                    // Añadir un margen de seguridad más amplio (5 segundos)
                    waitSeconds += 5;
                } else {
                    // Backoff exponencial más agresivo si no hay tiempo sugerido
                    waitSeconds = Math.pow(2, i) * 10 + Math.random() * 5;
                }

                const waitMs = Math.round(waitSeconds * 1000);
                sendProgress({ 
                    type: 'log', 
                    message: `⚠️ Límite de Cuota (429). Reintentando en ${Math.round(waitSeconds)}s (${i+1}/${maxRetries})...`,
                    isWaiting: true 
                });
                
                await sleep(waitMs);
                continue;
            }
            throw error;
        }
    }
    throw new Error('La cuota de Google AI se agotó o el límite de tiempo fue excedido. Intenta de nuevo en unos minutos.');
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

        const ordersResult = await pool.query("SELECT numero_documento FROM grupo_inter_pedidos WHERE acta_entrega_b64 IS NULL");
        const pendingDocs = ordersResult.rows.map(r => r.numero_documento);

        if (pendingDocs.length === 0) {
            res.json({ message: 'No hay pedidos pendientes.' });
            return;
        }

        const mainPdfDoc = await PDFDocument.load(req.file.buffer);
        const totalPages = mainPdfDoc.getPageCount();

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (data: any) => res.write(JSON.stringify(data) + '\n');
        let matches = 0;

        sendProgress({ type: 'start', totalPages, pendingDocs: pendingDocs.length });

        for (let i = 0; i < totalPages; i++) {
            const pageNum = i + 1;
            sendProgress({ type: 'log', message: `--- ANALIZANDO PÁGINA ${pageNum}/${totalPages} ---`, progress: Math.round((pageNum / totalPages) * 100) });

            const subPdf = await PDFDocument.create();
            const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
            subPdf.addPage(copiedPage);
            const base64Page = await subPdf.saveAsBase64();
            
            try {
                // Prompt optimizado para extracción pura de datos
                const prompt = `Actúa como un motor OCR de alta precisión. 
                Analiza esta imagen de una factura/remisión de transporte. 
                Busca y extrae exclusivamente el NÚMERO DE DOCUMENTO (Factura No., Remisión No., Guía No.). 
                Ignora fechas, valores monetarios y NITs. 
                Si encuentras el número, responde SOLO con el número (ej: 123456). 
                Si no hay un número de documento claro, responde "VACIO".`;
                
                // Throttling preventivo para cuota gratuita (15 RPM)
                if (i > 0) {
                    await sleep(2500); 
                }

                let result;
                try {
                    result = await generateContentWithRetry(visionModel, [{ text: prompt }, { inlineData: { data: base64Page, mimeType: "application/pdf" } }], sendProgress);
                } catch (e: any) {
                    // Fallback a modelo estable confirmado en el sistema
                    visionModel = getVisionModel("gemini-flash-latest");
                    result = await generateContentWithRetry(visionModel, [{ text: prompt }, { inlineData: { data: base64Page, mimeType: "application/pdf" } }], sendProgress);
                }
                
                const response = await result.response;
                // Limpieza agresiva de texto para evitar ruidos de OCR
                const rawText = response.text().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

                if (rawText && rawText !== "VACIO") {
                    for (const docNum of pendingDocs) {
                        const cleanDocNum = docNum.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        
                        // Coincidencia flexible (contiene o es contenido)
                        if (rawText.includes(cleanDocNum) || cleanDocNum.includes(rawText)) {
                            sendProgress({ type: 'log', message: `✅ MATCH DETECTADO: ${docNum} (Extracted: ${rawText})` });
                            await pool.query(
                                "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', update_at = CURRENT_TIMESTAMP, fecha_entregado = CURRENT_TIMESTAMP WHERE numero_documento = $2",
                                [base64Page, docNum]
                            );
                            matches++;
                        }
                    }
                }
            } catch (error: any) {
                sendProgress({ type: 'log', message: `❌ ERROR Pág ${pageNum}: ${error.message}` });
            }
        }

        sendProgress({ type: 'end', message: `Completado.`, matches });
        res.end();
    } catch (error) {
        console.error('[GRUPO-INTER] Error PDF:', error);
        res.status(500).json({ message: 'Error interno' });
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

