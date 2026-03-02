
import { Request, Response } from 'express';
import pool from '../config/database.js';
import { sendEmail } from '../services/notification.service.js';

export const getNovedades = async (req: Request, res: Response) => {
    const { docId } = req.params;
    try {
        const result = await pool.query(`
            SELECT n.*, a.sku as article_sku, a.name as article_name
            FROM inventory_news n
            LEFT JOIN articles a ON n.article_id = a.id
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
        // Verificar si ya existe una novedad para este artículo en este documento
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

        const newsRes = await pool.query(`
            SELECT n.*, a.sku as article_sku, a.name as article_name
            FROM inventory_news n
            LEFT JOIN articles a ON n.article_id = a.id
            WHERE n.document_id = $1
        `, [docId]);
        const news = newsRes.rows;

        if (news.length === 0) return res.status(400).json({ error: "No hay novedades para reportar" });

        const newsHtml = news.map(n => `
            <div style="margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                <h3 style="color: #0f172a; margin-bottom: 5px;">${n.article_sku} - ${n.article_name || 'Sin descripción'}</h3>
                <p style="font-size: 14px; color: #64748b;"><strong>Cantidad:</strong> ${n.quantity}</p>
                <p style="font-size: 14px; color: #64748b;"><strong>Observación:</strong> ${n.observation}</p>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                    ${(n.photo_urls || []).map((url: string) => `
                        <img src="${url}" style="width: 200px; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;" />
                    `).join('')}
                </div>
            </div>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <header style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0f172a; padding-bottom: 10px;">
                        <h1 style="color: #0f172a; margin: 0;">Reporte de Novedades de Inventario</h1>
                        <p style="color: #64748b; text-transform: uppercase; font-weight: bold; font-size: 12px;">Documento: ${doc.external_doc_id} | Placa: ${doc.vehicle_plate || 'S/A'}</p>
                    </header>
                    <section>
                        ${newsHtml}
                    </section>
                    <footer style="margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #eee; padding-top: 10px;">
                        Generado automáticamente por OrbitM7 • ${new Date().toLocaleDateString()}
                    </footer>
                </div>
            </body>
            </html>
        `;

        const subject = `⚠️ REPORTE DE NOVEDADES: ${doc.external_doc_id || doc.externalDocId} [${doc.vehicle_data || doc.vehicleData || 'S/V'}]`;
        
        for (const email of targetEmails) {
            await sendEmail(email, subject, html);
        }

        res.json({ success: true, message: "Reporte enviado correctamente" });
    } catch (err: any) {
        console.error('[REPORT-ERROR]', err);
        res.status(500).json({ error: "Error al enviar reporte", details: err.message });
    }
};
