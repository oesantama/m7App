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
    // Priorizamos nombres que confirmamos que existen en su API Key (REST diagnostic)
    const modelId = name || process.env.AI_MODEL || "gemini-2.0-flash";
    return genAI.getGenerativeModel({ model: modelId });
};

let visionModel = getVisionModel();

export const uploadExcel = async (req: any, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No se subió ningún archivo' });
            return;
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir a matriz de arreglos (aoa) para buscar el encabezado manualmente
        const normalize = (str: string) => 
            String(str || '')
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
                .replace(/[^a-zA-Z0-9 ]/g, " ")   // Reemplazar caracteres especiales por espacios
                .replace(/\s+/g, " ")            // Colapsar espacios múltiples
                .trim()
                .toUpperCase();

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        let headerRowIndex = -1;
        const columnAliases = {
            nro_documento: ['NUMERO DOCUMENTO', 'NRO DOCUMENTO', 'DOCUMENTO', 'REMISION', 'ORDEN', 'FACTURA', 'NRO_DOCUMENTO'],
            cliente: ['NOMBRE CLIENTE', 'NIT CLIENTE', 'CLIENTE', 'NOMBRE', 'DESTINATARIO', 'RAZON SOCIAL', 'NOMBRE_CLIENTE'],
            ciudad_destino: ['MUNICIPIO DESTINO', 'CIUDAD DESTINO', 'CIUDAD', 'DESTINO', 'MUNICIPIO', 'MUNICIPIO_DESTINO']
        };
        
        // Buscar encabezados en las primeras 25 filas
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = (rows[i] || []).map(cell => normalize(String(cell)));
            
            // Verificación por inclusión parcial para mayor robustez
            const hasDoc = currentRow.some(cell => 
                columnAliases.nro_documento.some(alias => cell.includes(normalize(alias)) || normalize(alias).includes(cell))
            );
            const hasCliente = currentRow.some(cell => 
                columnAliases.cliente.some(alias => cell.includes(normalize(alias)) || normalize(alias).includes(cell))
            );
            
            if (hasDoc && hasCliente) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.error('[GRUPO-INTER] No se detectó el encabezado. Filas analizadas:', rows.slice(0, 5));
            res.status(400).json({ 
                message: 'El formato no es el indicado (no se encontraron encabezados validos)',
                details: 'Se buscan columnas como: Número Documento, Cliente o Ciudad/Municipio Destino'
            });
            return;
        }

        // Obtener el encabezado normalizado para mapear posiciones por columna en vez de por llave de objeto,
        // lo que soluciona los desplazamientos si el Excel tiene celdas vacías de encabezados.
        const headerRow = (rows[headerRowIndex] || []).map(cell => normalize(String(cell)));
        console.log(`[GRUPO-INTER] Cabeceras detectadas (Fila ${headerRowIndex + 1}):`, headerRow);

        const getColIndex = (aliases: string[]) => {
            return headerRow.findIndex(cell => {
                if (!cell) return false;
                return aliases.some(alias => {
                    const normA = normalize(alias);
                    return cell === normA || cell.includes(normA) || normA.includes(cell);
                });
            });
        };

        const idxDoc = getColIndex(columnAliases.nro_documento);
        const idxProd = getColIndex(['PRODUCTO', 'ARTICULO', 'REFERENCIA', 'DESCRIPCION', 'ITEM']);
        const idxClient = getColIndex(columnAliases.cliente);
        const idxDest = getColIndex(columnAliases.ciudad_destino);
        const idxOrig = getColIndex(['CIUDAD ORIGEN', 'ORIGEN', 'CIUDAD_ORIGEN', 'PROVENIENCIA']);
        const idxGuia = getColIndex(['NRO GUIA', 'GUIA', 'NRO_GUIA', 'REBU', 'NOTA ENCABEZADO']);
        const idxPlaca = getColIndex(['PLACA', 'VEHICULO', 'TRUCK', 'CABEZOTE']);
        const idxCant = getColIndex(['CANTIDAD TOTAL', 'CANTIDAD', 'TOTAL', 'QTY', 'UNIDADES']);
        const idxPeso = getColIndex(['PESO TOTAL PROD.', 'PESO', 'WEIGHT', 'KILOS', 'PESO TOTAL']);
        const idxFlete = getColIndex(['VALOR FLETE', 'FLETE', 'PRECIO', 'VALOR_FLETE', 'PRECIO TOTAL']);
        const idxValor = getColIndex(['VALOR DECLARADO', 'PRECIO TOTAL', 'VALOR', 'PRECIO', 'TOTAL', 'VALOR_DECLARADO']);
        
        // Nuevas columnas solicitadas
        const idxNit = getColIndex(['NIT CLIENTE', 'NIT', 'IDENTIFICACION', 'CEDULA']);
        const idxDir = getColIndex(['DIRECCION', 'DIR', 'DOMICILIO']);
        const idxNota = getColIndex(['NOTA ENCABEZADO', 'NOTAS', 'OBSERVACIONES', 'COMENTARIO']);
        const idxCorte = getColIndex(['F. ULTIMO CORTE', 'F ULTIMO CORTE', 'FECHA CORTE', 'CORTE']);
        const idxClasif = getColIndex(['CLASIFICACION', 'CATEGORIA', 'TIPO']);
        const idxEmpresa = getColIndex(['EMPRESA', 'COMPAÑIA', 'CIA']);

        let savedCount = 0;
        let skippedCount = 0;
        let duplicateCount = 0;

        const username = req.body.username || 'System';

        // Parsear números de forma segura quitando caracteres no numéricos excepto punto/coma
        const parseNum = (val: any) => {
            if (val === undefined || val === null || val === '') return 0;
            const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
            return parseFloat(clean) || 0;
        };

        // Parsear fechas de Excel (pueden venir como números o strings)
        const parseExcelDate = (val: any) => {
            if (!val) return null;
            try {
                if (typeof val === 'number') {
                    // Excel date serial number
                    return new Date((val - 25569) * 86400 * 1000);
                }
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) {
                return null;
            }
        };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const rowArr = rows[i];
            if (!rowArr || rowArr.length === 0) continue; 

            const nro_documento = idxDoc >= 0 ? String(rowArr[idxDoc] || '').trim() : '';
            const producto = idxProd >= 0 ? String(rowArr[idxProd] || '').trim() : 'GENERAL';
            
            if (!nro_documento || nro_documento.length < 1) {
                skippedCount++;
                continue;
            }

            // Verificar duplicado antes de insertar (Documento + Producto)
            const exists = await pool.query(
                'SELECT 1 FROM grupo_inter_pedidos WHERE nro_documento = $1 AND producto = $2',
                [nro_documento, producto]
            );

            if (exists.rows.length > 0) {
                duplicateCount++;
                continue; 
            }

            const cliente = idxClient >= 0 ? String(rowArr[idxClient] || '').trim() : '';
            const ciudad_destino = idxDest >= 0 ? String(rowArr[idxDest] || '').trim() : '';
            const ciudad_origen = idxOrig >= 0 ? String(rowArr[idxOrig] || '').trim() : 'MEDELLIN';
            const nro_guia = idxGuia >= 0 ? String(rowArr[idxGuia] || '').trim() : '';
            const placa = idxPlaca >= 0 ? String(rowArr[idxPlaca] || '').trim() : '';
            
            const cantidadRaw = idxCant >= 0 ? rowArr[idxCant] : '0';
            const pesoRaw = idxPeso >= 0 ? rowArr[idxPeso] : '0';
            const fleteRaw = idxFlete >= 0 ? rowArr[idxFlete] : '0';
            const valorRaw = idxValor >= 0 ? rowArr[idxValor] : '0';

            // Nuevos campos
            const nit_cliente = idxNit >= 0 ? String(rowArr[idxNit] || '').trim() : '';
            const direccion = idxDir >= 0 ? String(rowArr[idxDir] || '').trim() : '';
            const nota_encabezado = idxNota >= 0 ? String(rowArr[idxNota] || '').trim() : '';
            const f_ultimo_corte = idxCorte >= 0 ? parseExcelDate(rowArr[idxCorte]) : null;
            const clasificacion = idxClasif >= 0 ? String(rowArr[idxClasif] || '').trim() : '';
            const empresa = idxEmpresa >= 0 ? String(rowArr[idxEmpresa] || '').trim() : '';

            const query = `
                INSERT INTO grupo_inter_pedidos (
                    nro_documento, producto, cliente, ciudad_origen, ciudad_destino, 
                    peso, cantidad, valor_flete, valor_declarado, nro_guia, placa,
                    estado, created_by, updated_by,
                    nit_cliente, direccion, nota_encabezado, f_ultimo_corte, clasificacion, empresa, muni_destino_original
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', $12, $12, $13, $14, $15, $16, $17, $18, $19)
            `;

            const values = [
                nro_documento,
                producto || 'GENERAL',
                cliente,
                ciudad_origen,
                ciudad_destino,
                parseNum(pesoRaw),
                parseNum(cantidadRaw),
                parseNum(fleteRaw),
                parseNum(valorRaw),
                nro_guia,
                placa,
                username,
                nit_cliente,
                direccion,
                nota_encabezado,
                f_ultimo_corte,
                clasificacion,
                empresa,
                ciudad_destino // muni_destino_original
            ];

            await pool.query(query, values);
            savedCount++;
        }

        console.log(`[GRUPO-INTER] Resultado: ${savedCount} guardados, ${duplicateCount} duplicados, ${skippedCount} saltados.`);
        res.json({ 
            message: `Excel procesado: ${savedCount} registros nuevos, ${duplicateCount} duplicados omitidos`, 
            count: savedCount,
            duplicates: duplicateCount,
            skipped: skippedCount
        });
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

        console.log('[GRUPO-INTER] Iniciando procesamiento de PDF con Gemini OCR...');
        
        // Obtener documentos pendientes para buscar
        const ordersResult = await pool.query("SELECT nro_documento FROM grupo_inter_pedidos WHERE acta_entrega_b64 IS NULL");
        const pendingDocs = ordersResult.rows.map(r => r.nro_documento);

        if (pendingDocs.length === 0) {
            res.json({ message: 'No hay pedidos pendientes de acta para este PDF.' });
            return;
        }

        // Cargar el documento original con pdf-lib para extraer páginas
        const mainPdfDoc = await PDFDocument.load(req.file.buffer);
        const totalPages = mainPdfDoc.getPageCount();
        console.log(`[GRUPO-INTER] PDF leído: ${totalPages} páginas.`);

        // Configurar cabeceras para Streaming
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (data: any) => {
            res.write(JSON.stringify(data) + '\n');
        };

        let matches = 0;
        sendProgress({ type: 'start', totalPages, pendingDocs: pendingDocs.length });

        for (let i = 0; i < totalPages; i++) {
            const pageNum = i + 1;
            sendProgress({ type: 'log', message: `--- ANALIZANDO PÁGINA ${pageNum}/${totalPages} ---`, progress: Math.round((pageNum / totalPages) * 100) });

            // Extraer la página individualmente con pdf-lib
            const subPdf = await PDFDocument.create();
            const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
            subPdf.addPage(copiedPage);
            
            // Convertir página a Base64 para Gemini
            const base64Page = await subPdf.saveAsBase64();
            
            try {
                const prompt = `Analiza detalladamente esta página de un documento logístico (puede ser un escaneo o imagen).
                
                OBJETIVO: Extraer el Número de Documento, Factura o Comprobante.
                
                UBICACIÓN TÍPICA:
                - Esquina superior DERECHA o CENTRO superior.
                - Suele estar cerca de términos como "No.", "FACTURA", "FEV", "FV", "FEI", "FI", "L-", "Documento de Despacho", "Remisión".
                
                FORMATOS COMUNES:
                - FEI-XXXXX (ej. FEI-12345)
                - FI-XXXXX
                - FV-XXXXX
                - LXXXXX (ej. L010904166)
                - Solo números (ej. 10904166)
                
                INSTRUCCIONES:
                1. Busca en la parte superior del documento.
                2. Extrae TODOS los números que parezcan ser identificadores de documento.
                3. Responde ÚNICAMENTE con los números encontrados separados por comas. 
                4. Si no encuentras ningún número de documento claro, responde "VACIO".`;
                
                let result;
                try {
                    result = await visionModel.generateContent([
                        { text: prompt },
                        { inlineData: { data: base64Page, mimeType: "application/pdf" } }
                    ]);
                } catch (e: any) {
                    if (e.message && (e.message.includes('404') || e.message.includes('not found'))) {
                        sendProgress({ type: 'log', message: `⚠️ Fallback: Aplicando gemini-flash-latest...` });
                        visionModel = getVisionModel("gemini-flash-latest");
                        result = await visionModel.generateContent([
                            { text: prompt },
                            { inlineData: { data: base64Page, mimeType: "application/pdf" } }
                        ]);
                    } else {
                        throw e;
                    }
                }
                
                const response = await result.response;
                const rawText = response.text().trim();
                sendProgress({ type: 'log', message: `Pág ${pageNum}: Detectado "${rawText}"` });

                if (rawText === "VACIO") continue;

                const detectedParts = rawText.toUpperCase().split(',').map(p => p.trim());

                for (const docNum of pendingDocs) {
                    const cleanDocNum = docNum.toUpperCase().trim();
                    const numericPedidido = cleanDocNum.replace(/[^0-9]/g, '');
                    
                    if (numericPedidido.length < 4) continue; 

                    let isMatch = false;
                    let matchReason = "";

                    for (const part of detectedParts) {
                        const numericPart = part.replace(/[^0-9]/g, '');
                        
                        if (part === cleanDocNum) {
                            isMatch = true;
                            matchReason = "Match Exacto";
                            break;
                        }

                        if (numericPart === numericPedidido || 
                            (numericPart.length > 5 && numericPart.includes(numericPedidido)) ||
                            (numericPedidido.length > 5 && numericPedidido.includes(numericPart))) {
                            isMatch = true;
                            matchReason = `Match Numérico (${numericPart})`;
                            break;
                        }
                        
                        const fuzzyPart = numericPart.replace(/[O]/g, '0').replace(/[I|L]/g, '1').replace(/[S]/g, '5').replace(/[B]/g, '8');
                        const fuzzyPedido = numericPedidido.replace(/[O]/g, '0').replace(/[I|L]/g, '1').replace(/[S]/g, '5').replace(/[B]/g, '8');
                        
                        if (fuzzyPart !== "" && (fuzzyPart.includes(fuzzyPedido) || fuzzyPedido.includes(fuzzyPart))) {
                            isMatch = true;
                            matchReason = `Match Fuzzy (${fuzzyPart})`;
                            break;
                        }
                    }

                    if (isMatch) {
                        sendProgress({ type: 'log', message: `✅ MATCH ENCONTRADO: ${docNum} (${matchReason})` });
                        
                        await pool.query(
                            "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', updated_at = CURRENT_TIMESTAMP WHERE nro_documento = $2",
                            [base64Page, docNum]
                        );
                        matches++;
                    }
                }
                
                // Rate limit guard
                if (totalPages > 10) await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error: any) {
                sendProgress({ type: 'log', message: `❌ ERROR Pág ${pageNum}: ${error.message}` });
                if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
                    sendProgress({ type: 'log', message: `⏳ Límite de cuota: Esperando 15s...` });
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    i--; 
                }
            }
        }

        sendProgress({ type: 'end', message: `Procesamiento completado.`, matches });
        res.end();

    } catch (error) {
        console.error('[GRUPO-INTER] Error al procesar PDF:', error);
        res.status(500).json({ message: 'Error interno al procesar el PDF con Gemini' });
    }
};

export const getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search, status, client, fechaCorteDesde, fechaCorteHasta } = req.query;
        let query = 'SELECT * FROM grupo_inter_pedidos WHERE 1=1';
        const values: any[] = [];

        if (search) {
            values.push(`%${search}%`);
            query += ` AND (nro_documento ILIKE $${values.length} OR nro_guia ILIKE $${values.length} OR cliente ILIKE $${values.length})`;
        }

        if (status) {
            values.push(status);
            query += ` AND estado = $${values.length}`;
        }

        if (client) {
            values.push(`%${client}%`);
            query += ` AND cliente ILIKE $${values.length}`;
        }

        if (fechaCorteDesde && fechaCorteDesde !== '') {
            values.push(fechaCorteDesde);
            query += ` AND f_ultimo_corte >= $${values.length}`;
        }

        if (fechaCorteHasta && fechaCorteHasta !== '') {
            values.push(fechaCorteHasta);
            query += ` AND f_ultimo_corte <= $${values.length}`;
        }

        query += ' ORDER BY created_at DESC LIMIT 500';
        
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error('[GRUPO-INTER] Error al obtener pedidos:', error);
        res.status(500).json({ message: 'Error al obtener pedidos' });
    }
};

export const getOrderPublic = async (req: Request, res: Response): Promise<void> => {
    try {
        const { orderNumber } = req.params;
        
        const query = 'SELECT * FROM grupo_inter_pedidos WHERE nro_documento = $1 OR nro_guia = $1';
        const result = await pool.query(query, [orderNumber]);

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'Pedido no encontrado' });
            return;
        }

        const order = result.rows[0];
        
        const responseData = {
            estado: order.estado === 'Entregado' ? 'Entregado' : order.estado,
            nroGuia: order.nro_guia,
            fechaEntregado: order.fecha_entregado ? (typeof order.fecha_entregado === 'string' ? order.fecha_entregado : order.fecha_entregado.toISOString().replace('T', ' ').substring(0, 16)) : null,
            ciudadOrigen: order.ciudad_origen,
            ciudadOrigenCod: order.ciudad_origen_cod || '',
            latitud: parseFloat(order.latitud || 0),
            longitud: parseFloat(order.longitud || 0),
            placa: order.placa,
            ciudadDestino: order.ciudad_destino,
            ciudadDestinoCod: order.ciudad_destino_cod || '',
            actaEntrega: order.acta_entrega_b64 ? `data:image/png;base64,${order.acta_entrega_b64}` : null,
            productos: {
                peso: parseFloat(order.peso || 0),
                cantidad: parseFloat(order.cantidad || 0),
                valorFlete: parseFloat(order.valor_flete || 0),
                valorDeclarado: parseFloat(order.valor_declarado || 0)
            },
            Novedades: order.history || []
        };

        res.json(responseData);
    } catch (error) {
        console.error('[GRUPO-INTER] Error API Pública:', error);
        res.status(500).json({ message: 'Error interno del servicio' });
    }
};

