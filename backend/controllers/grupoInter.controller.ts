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

        // Extraer los datos a partir del encabezado encontrado
        const excelData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex }) as any[];

        // M7 NUCLEAR HEAL: Asegurar columnas de auditoría y unicidad
        try {
            await pool.query('ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS producto TEXT;');
            await pool.query('ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS created_by TEXT;');
            await pool.query('ALTER TABLE grupo_inter_pedidos ADD COLUMN IF NOT EXISTS updated_by TEXT;');
            
            // Reconfigurar unicidad: Eliminar la vieja de nro_documento y crear la compuesta con producto
            await pool.query('ALTER TABLE grupo_inter_pedidos DROP CONSTRAINT IF EXISTS grupo_inter_pedidos_nro_documento_key;');
            await pool.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grupo_inter_pedidos_doc_prod_key') THEN
                        ALTER TABLE grupo_inter_pedidos ADD CONSTRAINT grupo_inter_pedidos_doc_prod_key UNIQUE (nro_documento, producto);
                    END IF;
                END $$;
            `);
        } catch (healErr) {
            console.warn('[GRUPO-INTER] Nuclear Heal Warning:', healErr);
        }

        console.log(`[GRUPO-INTER] Header detectado en fila: ${headerRowIndex + 1}`);
        console.log(`[GRUPO-INTER] Procesando ${excelData.length} filas del Excel...`);
        
        const username = req.body.username || 'System';

        // Función para obtener valor de una columna usando aliases
        const getVal = (row: any, aliases: string[]) => {
            const keys = Object.keys(row);
            const foundKey = keys.find(k => {
                const normK = normalize(k);
                return aliases.some(alias => {
                    const normA = normalize(alias);
                    return normK === normA || normK.includes(normA) || normA.includes(normK);
                });
            });
            return foundKey ? String(row[foundKey] || '').trim() : '';
        };

        // Extraer las cabeceras reales de la primera fila para el log de diagnóstico
        const realHeaders = Object.keys(excelData[0] || {});
        console.log(`[GRUPO-INTER] Procesando ${excelData.length} filas. Cabeceras detectadas encontradas en el archivo:`, realHeaders);

        let savedCount = 0;
        let skippedCount = 0;
        let duplicateCount = 0;

        for (let index = 0; index < excelData.length; index++) {
            const row = excelData[index];
            const nro_documento = getVal(row, columnAliases.nro_documento);
            const producto = getVal(row, ['PRODUCTO', 'ARTICULO', 'REFERENCIA', 'DESCRIPCION', 'ITEM']) || 'GENERAL';
            
            // Validación relajada: Solo pedimos que el documento exista y tenga al menos 1 caracter.
            if (!nro_documento || String(nro_documento).trim().length < 1) {
                if (skippedCount < 3) {
                     console.log(`[GRUPO-INTER] ⚠️ Fila ${index + 2} saltada. No se detectó un número de documento válido en esta fila. Cabeceras evaluadas:`, JSON.stringify(Object.fromEntries(Object.entries(row).slice(0, 5))));
                }
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
                continue; // No cargar porque ya existe
            }

            const cliente = getVal(row, columnAliases.cliente);
            const ciudad_destino = getVal(row, columnAliases.ciudad_destino);
            const ciudad_origen = getVal(row, ['CIUDAD ORIGEN', 'ORIGEN', 'CIUDAD_ORIGEN', 'PROVENIENCIA']) || 'MEDELLIN';
            const nro_guia = getVal(row, ['NRO GUIA', 'GUIA', 'NRO_GUIA', 'REBU', 'NOTA ENCABEZADO']);
            const placa = getVal(row, ['PLACA', 'VEHICULO', 'TRUCK', 'CABEZOTE']);
            
            // Cantidad y otros campos numéricos
            const cantidadRaw = getVal(row, ['CANTIDAD TOTAL', 'CANTIDAD', 'TOTAL', 'QTY', 'UNIDADES']);
            const pesoRaw = getVal(row, ['PESO TOTAL PROD.', 'PESO', 'WEIGHT', 'KILOS', 'PESO TOTAL']);
            const fleteRaw = getVal(row, ['VALOR FLETE', 'FLETE', 'PRECIO', 'VALOR_FLETE', 'PRECIO TOTAL']);
            const valorRaw = getVal(row, ['VALOR DECLARADO', 'PRECIO TOTAL', 'VALOR', 'PRECIO', 'TOTAL', 'VALOR_DECLARADO']);

            // Parsear números de forma segura quitando caracteres no numéricos excepto punto/coma
            const parseNum = (val: string) => {
                const clean = val.replace(/[^0-9.,]/g, '').replace(',', '.');
                return parseFloat(clean) || 0;
            };

            const query = `
                INSERT INTO grupo_inter_pedidos (
                    nro_documento, producto, cliente, ciudad_origen, ciudad_destino, 
                    peso, cantidad, valor_flete, valor_declarado, nro_guia, placa,
                    estado, created_by, updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', $12, $12)
            `;

            const values = [
                nro_documento,
                producto,
                cliente,
                ciudad_origen,
                ciudad_destino,
                parseNum(pesoRaw),
                parseNum(cantidadRaw),
                parseNum(fleteRaw),
                parseNum(valorRaw),
                nro_guia,
                placa,
                username
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
        const { search, status, client } = req.query;
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
