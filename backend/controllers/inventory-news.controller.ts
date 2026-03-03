import { Request, Response } from 'express';
import pool from '../config/database.js';
import { sendEmail } from '../services/notification.service.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

export const getNovedades = async (req: Request, res: Response) => {
    const { docId } = req.params;
    try {
        const result = await pool.query(`
            SELECT n.*, 
                   COALESCE(a.sku, n.article_id, 'S/SKU') as article_sku, 
                   COALESCE(a.name, n.observation, 'SIN NOMBRE') as article_name
            FROM inventory_news n
            LEFT JOIN articles a ON (
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.id AS TEXT))) OR 
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.sku AS TEXT))) OR
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.barcode AS TEXT)))
            )
            WHERE n.document_id = $1
            ORDER BY n.created_at DESC
        `, [docId]);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: "Error al obtener novedades", details: err.message });
    }
};

export const saveNovedad = async (req: Request, res: Response) => {
    const { documentId, articleId, quantity, observation, photoUrls, userName } = req.body;
    try {
        const check = await pool.query(
            'SELECT id, quantity, observation, photo_urls FROM inventory_news WHERE document_id = $1 AND article_id = $2',
            [documentId, articleId]
        );

        if (check.rows.length > 0) {
            const existing = check.rows[0];
            const newQuantity = Number(existing.quantity) + Number(quantity);
            const newObservation = `${existing.observation}\n---\n${observation}`;
            const newPhotos = [...(existing.photo_urls || []), ...(photoUrls || [])];

            await pool.query(`
                UPDATE inventory_news 
                SET quantity = $1, observation = $2, photo_urls = $3, user_name = $4, created_at = CURRENT_TIMESTAMP
                WHERE id = $5
            `, [newQuantity, newObservation, newPhotos, userName, existing.id]);

            return res.json({ success: true, message: "Novedad actualizada correctamente" });
        } else {
            await pool.query(`
                INSERT INTO inventory_news (document_id, article_id, quantity, observation, photo_urls, user_name)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [documentId, articleId, quantity, observation, photoUrls, userName]);

            return res.json({ success: true, message: "Novedad registrada correctamente" });
        }
    } catch (err: any) {
        res.status(500).json({ error: "Error al guardar novedad", details: err.message });
    }
};

export const sendNovedadesReport = async (req: Request, res: Response) => {
    const { docId, targetEmails } = req.body;
    try {
        const docRes = await pool.query('SELECT * FROM documents_l WHERE id = $1', [docId]);
        if (docRes.rows.length === 0) return res.status(404).json({ error: "Documento no encontrado" });
        const doc = docRes.rows[0];
        
        // Corregir placa: vehicle_plate es el campo real en la BD
        const placa = doc.vehicle_plate || doc.vehicleData || doc.vehicle_data || 'SIN PLACA';

        const newsRes = await pool.query(`
            SELECT n.*, 
                   COALESCE(a.sku, n.article_id, 'S/SKU') as article_sku, 
                   COALESCE(a.name, n.observation, 'SIN NOMBRE') as article_name
            FROM inventory_news n
            LEFT JOIN articles a ON (
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.id AS TEXT))) OR 
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.sku AS TEXT))) OR
                TRIM(UPPER(CAST(n.article_id AS TEXT))) = TRIM(UPPER(CAST(a.barcode AS TEXT)))
            )
            WHERE n.document_id = $1
            ORDER BY n.created_at ASC
        `, [docId]);
        const news = newsRes.rows;

        if (news.length === 0) return res.status(400).json({ error: "No hay novedades para reportar" });

        // GENERACIÓN DE PDF PROFESIONAL
        const doc_pdf = new jsPDF() as any;
        const pageWidth = doc_pdf.internal.pageSize.width;

        // Banner Superior
        doc_pdf.setFillColor(15, 23, 42); // Slate 900
        doc_pdf.rect(0, 0, pageWidth, 40, 'F');
        
        doc_pdf.setTextColor(255, 255, 255);
        doc_pdf.setFontSize(22);
        doc_pdf.setFont("helvetica", "bold");
        doc_pdf.text("REPORTE DE NOVEDADES", 14, 20);
        
        doc_pdf.setFontSize(10);
        doc_pdf.text(`DOCUMENTO: ${doc.external_doc_id || doc.externalDocId}`, 14, 30);
        doc_pdf.text(`PLACA: ${placa}`, 14, 35);
        
        doc_pdf.setFontSize(8);
        doc_pdf.text(`GENERADO: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, pageWidth - 14, 35, { align: 'right' });

        // Tabla de Contenido
        const tableBody = news.map(n => [
            n.article_sku,
            n.article_name,
            n.quantity.toString(),
            n.observation,
            n.user_name || 'N/A'
        ]);

        autoTable(doc_pdf, {
            startY: 50,
            head: [['SKU', 'DESCRIPCIÓN', 'CANT', 'OBSERVACIÓN', 'REGISTRÓ']],
            body: tableBody,
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            styles: { fontSize: 9, cellPadding: 4 },
            columnStyles: {
                0: { cellWidth: 25, fontStyle: 'bold' },
                2: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 25 }
            }
        });

        // Galería de Fotos (Anexo)
        let currentY = (doc_pdf as any).lastAutoTable.finalY + 15;
        
        doc_pdf.setTextColor(15, 23, 42);
        doc_pdf.setFontSize(14);
        doc_pdf.text("ANEXO FOTOGRÁFICO", 14, currentY);
        currentY += 10;

        const photoSize = 60;
        const margin = 10;
        let xPos = 14;

        for (const n of news) {
            if (n.photo_urls && n.photo_urls.length > 0) {
                if (currentY + 10 > 280) { doc_pdf.addPage(); currentY = 20; }
                
                doc_pdf.setFontSize(10);
                doc_pdf.setTextColor(30, 41, 59);
                doc_pdf.setFont("helvetica", "bold");
                doc_pdf.text(`ARTÍCULO: ${n.article_sku}`, xPos, currentY);
                currentY += 7;

                for (const url of n.photo_urls) {
                    if (currentY + photoSize > 280) {
                        doc_pdf.addPage();
                        currentY = 20;
                    }
                    try {
                        doc_pdf.addImage(url, 'JPEG', xPos, currentY, photoSize, photoSize);
                        xPos += photoSize + margin;
                        if (xPos + photoSize > pageWidth) {
                            xPos = 14;
                            currentY += photoSize + margin;
                        }
                    } catch (e) {
                        console.warn("No se pudo añadir imagen al PDF", e);
                    }
                }
                if (xPos !== 14) {
                    xPos = 14;
                    currentY += photoSize + margin;
                } else {
                    currentY += margin;
                }
            }
        }

        const pdfBuffer = Buffer.from(doc_pdf.output('arraybuffer'));

        // CUERPO DEL CORREO SIMPLIFICADO
        const subject = `⚠️ REPORTE DE NOVEDADES: ${doc.external_doc_id || doc.externalDocId} | ${placa}`;
        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #0f172a; padding: 24px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em;">REPORTE DE NOVEDADES</h1>
                </div>
                <div style="padding: 32px; line-height: 1.6;">
                    <p style="margin-top: 0;">Estimado(a),</p>
                    <p>Se ha generado el <strong>Reporte Oficial de Novedades</strong> correspondiente a la siguiente operación:</p>
                    <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #f1f5f9;">
                        <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 700; text-transform: uppercase;">Documento</p>
                        <p style="margin: 4px 0 12px 0; font-size: 16px; font-weight: 800; color: #0f172a;">${doc.external_doc_id || doc.externalDocId}</p>
                        <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 700; text-transform: uppercase;">Vehículo</p>
                        <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 800; color: #0f172a;">${placa}</p>
                    </div>
                    <p>Encontrará adjunto a este correo el documento PDF con el detalle de los artículos, cantidades, observaciones y sus respectivos anexos fotográficos.</p>
                    <p style="margin-bottom: 0;">Si tiene alguna duda sobre esta información, por favor contacte al equipo de auditoría.</p>
                </div>
                <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
                    Este es un correo automático generado por el sistema OrbitM7. Por favor no responda.
                </div>
            </div>
        `;

        await sendEmail(targetEmails, subject, html, [
            {
                filename: `Reporte_Novedades_${doc.externalDocId || doc.external_doc_id}.pdf`,
                content: pdfBuffer
            }
        ]);

        res.json({ success: true, message: "Reporte enviado correctamente con PDF adjunto" });
    } catch (err: any) {
        console.error('[REPORT-ERROR]', err);
        res.status(500).json({ error: "Error al enviar reporte", details: err.message });
    }
};
