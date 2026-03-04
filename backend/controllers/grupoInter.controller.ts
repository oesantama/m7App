import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';

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
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        let headerRowIndex = -1;
        const requiredColumns = ['NRO DOCUMENTO', 'CLIENTE', 'CIUDAD DESTINO'];
        
        // Buscar encabezados en las primeras 25 filas
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const currentRow = rows[i].map(cell => String(cell || '').trim().toUpperCase());
            const foundAll = requiredColumns.every(col => currentRow.includes(col));
            
            if (foundAll) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            res.status(400).json({ message: 'El formato no es el indicado (no se encontraron encabezados en las primeras 25 líneas)' });
            return;
        }

        // Extraer los datos a partir del encabezado encontrado
        const excelData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });

        console.log(`[GRUPO-INTER] Procesando ${excelData.length} filas del Excel (empezando desde fila ${headerRowIndex + 1})...`);

        for (const row of (excelData as any[])) {
            const nro_documento = String(row['NRO DOCUMENTO'] || row['Documento'] || '').trim();
            if (!nro_documento) continue;

            const query = `
                INSERT INTO grupo_inter_pedidos (
                    nro_documento, cliente, ciudad_origen, ciudad_destino, 
                    peso, cantidad, valor_flete, valor_declarado, nro_guia, placa
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (nro_documento) DO UPDATE SET
                    cliente = EXCLUDED.cliente,
                    ciudad_origen = EXCLUDED.ciudad_origen,
                    ciudad_destino = EXCLUDED.ciudad_destino,
                    peso = EXCLUDED.peso,
                    cantidad = EXCLUDED.cantidad,
                    valor_flete = EXCLUDED.valor_flete,
                    valor_declarado = EXCLUDED.valor_declarado,
                    nro_guia = EXCLUDED.nro_guia,
                    placa = EXCLUDED.placa,
                    updated_at = CURRENT_TIMESTAMP
            `;

            const values = [
                nro_documento,
                row['CLIENTE'] || '',
                row['CIUDAD ORIGEN'] || '',
                row['CIUDAD DESTINO'] || '',
                parseFloat(row['PESO'] || 0),
                parseFloat(row['CANTIDAD'] || 0),
                parseFloat(row['VALOR FLETE'] || 0),
                parseFloat(row['VALOR DECLARADO'] || 0),
                row['NRO GUIA'] || '',
                row['PLACA'] || ''
            ];

            await pool.query(query, values);
        }

        res.json({ message: 'Excel procesado correctamente', count: excelData.length });
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

        console.log('[GRUPO-INTER] Iniciando procesamiento de PDF...');
        
        const pdfInstance = new PDFParse({ data: req.file.buffer, verbosity: 0 });
        const pdfData = await pdfInstance.getText();
        const totalPages = pdfData.total;
        console.log(`[GRUPO-INTER] PDF leído: ${totalPages} páginas.`);

        // Obtener documentos pendientes para buscar
        const ordersResult = await pool.query("SELECT nro_documento FROM grupo_inter_pedidos WHERE acta_entrega_b64 IS NULL");
        const pendingDocs = ordersResult.rows.map(r => r.nro_documento);

        if (pendingDocs.length === 0) {
            res.json({ message: 'No hay pedidos pendientes de acta para este PDF.' });
            return;
        }

        // Cargar el documento original con pdf-lib para extraer páginas
        const mainPdfDoc = await PDFDocument.load(req.file.buffer);
        let matches = 0;

        for (let i = 0; i < totalPages; i++) {
            // Extraer la página individualmente con pdf-lib y pasarla a pdf-parse
            const subPdf = await PDFDocument.create();
            const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
            subPdf.addPage(copiedPage);
            const subPdfBuffer = Buffer.from(await subPdf.save());
            
            const subPdfInstance = new PDFParse({ data: subPdfBuffer, verbosity: 0 });
            const subPdfData = await subPdfInstance.getText();
            const pageText = subPdfData.text;

            for (const docNum of pendingDocs) {
                if (pageText.includes(docNum)) {
                    console.log(`[GRUPO-INTER] Match encontrado: Doc ${docNum} en pág ${i + 1}`);
                    
                    // Extraer esta página como base64
                    const base64 = await subPdf.saveAsBase64();
                    
                    // Guardar en DB
                    await pool.query(
                        "UPDATE grupo_inter_pedidos SET acta_entrega_b64 = $1, estado = 'Entregado', updated_at = CURRENT_TIMESTAMP WHERE nro_documento = $2",
                        [base64, docNum]
                    );
                    matches++;
                }
            }
        }

        res.json({ 
            message: `Procesamiento completado. Se encontraron ${matches} coincidencias.`, 
            matches 
        });

    } catch (error) {
        console.error('[GRUPO-INTER] Error al procesar PDF:', error);
        res.status(500).json({ message: 'Error al procesar PDF' });
    }
};

export const getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { search } = req.query;
        let query = 'SELECT * FROM grupo_inter_pedidos';
        const values: any[] = [];

        if (search) {
            query += ' WHERE nro_documento ILIKE $1 OR nro_guia ILIKE $1 OR cliente ILIKE $1';
            values.push(`%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';
        
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
        
        // Formatear respuesta según requerimiento exacto del cliente
        const responseData = {
            estado: order.estado === 'Entregado' ? 'Entregado' : order.estado,
            nroGuia: order.nro_guia,
            fechaEntregado: order.fecha_entregado ? order.fecha_entregado.toISOString().replace('T', ' ').substring(0, 16) : null,
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
