import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import pool from '../config/db.js';
import { sendEmail } from '../services/notification.service.js';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const uploadCumplido = async (req: Request, res: Response) => {
    const { clientId, clientName } = req.body;
    const file = req.file;
    const userId = (req as any).user?.id;

    if (!file || !clientId || !clientName) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (archivo, cliente)' });
    }

    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = MESES[now.getMonth()];
        const day = `dia ${now.getDate()}`;

        // Limpiar nombre del cliente para carpeta (quitar puntos, comas, etc)
        const cleanClientName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();

        // Ruta en Drive: cumplidos/2026/CLIENTE/Mes/dia DD
        const drivePath = `cumplidos/${year}/${cleanClientName}/${month}/${day}`;
        const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;

        // 1. Asegurar que la carpeta existe en Drive usando rclone (configurada en el servidor)
        const rcloneConfig = '/config/rclone.conf';
        
        console.log(`[CUMPLIDOS] Iniciando subida a: ${drivePath}/${fileName}`);

        // Comando para subir: rclone copy <archivo_local> <remoto>:<ruta>
        const uploadCmd = `rclone --config ${rcloneConfig} copyto "${file.path}" "gdrive_cumplidos:${drivePath}/${fileName}"`;

        exec(uploadCmd, async (error, stdout, stderr) => {
            if (error) {
                console.error(`[CUMPLIDOS] Error rclone copy: ${stderr}`);
                return res.status(500).json({ error: 'Error al subir a Google Drive' });
            }

            // 2. Obtener el link público del archivo
            const linkCmd = `rclone --config ${rcloneConfig} link "gdrive_cumplidos:${drivePath}/${fileName}"`;

            exec(linkCmd, async (linkErr, linkStdout, linkStderr) => {
                let driveLink = '';
                if (!linkErr) {
                    driveLink = linkStdout.trim();
                }

                // 3. Contar cuántos archivos hay en la carpeta final (Eficiencia)
                const countCmd = `rclone --config ${rcloneConfig} lsf "gdrive_cumplidos:${drivePath}" | wc -l`;
                exec(countCmd, async (countErr, countStdout) => {
                    const fileCount = parseInt(countStdout.trim()) || 1;

                    // 4. Obtener datos del cliente y configurar notificaciones
                    try {
                        const clientRes = await pool.query('SELECT name, client_type FROM clients WHERE id = $1', [clientId]);
                        const isNational = clientRes.rows[0]?.client_type === 'NACIONAL';

                        // 5. Registrar en la base de datos
                        await pool.query(
                            `INSERT INTO document_logs (user_id, client_id, file_name, drive_path, drive_link, category)
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            [userId, clientId, fileName, drivePath, driveLink, 'CUMPLIDOS']
                        );

                        // 6. Si es nacional, disparar correo automático
                        if (isNational) {
                            console.log(`[CUMPLIDOS] Cliente Nacional detectado. Buscando correos para TGN-002...`);
                            const notifRes = await pool.query(
                                "SELECT notification_email FROM notificaciones WHERE tipo_notificacion_id = 'TGN-002' AND status_id = 'EST-01'"
                            );
                            
                            const emails = notifRes.rows.map(r => r.notification_email).filter(e => e).join(',');
                            if (emails) {
                                console.log(`[CUMPLIDOS] Enviando notificación a: ${emails}`);
                                const subject = `[M7 DRIVE] Nuevo Cumplido - ${clientRes.rows[0].name}`;
                                const html = `
                                    <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                        <h2 style="color: #4f46e5;">Notificación de Carga - Orbit M7 IQ</h2>
                                        <p>Se ha subido un nuevo documento de cumplimiento para el cliente: <b>${clientRes.rows[0].name}</b></p>
                                        <hr style="border: 0; border-top: 1px solid #eee;" />
                                        <p><b>Archivo:</b> ${fileName}</p>
                                        <p><b>Ruta en Drive:</b> ${drivePath}</p>
                                        <p><b>Link de Acceso:</b> <a href="${driveLink}" style="color: #4f46e5;">Ver Documento en Drive</a></p>
                                        <br />
                                        <p style="font-size: 12px; color: #666;">Este es un mensaje automático generado por el núcleo de inteligencia Orbit M7.</p>
                                    </div>
                                `;
                                await sendEmail(emails, subject, html).catch(err => console.error('[CUMPLIDOS] Error enviando mail:', err));
                            }
                        }

                        // Limpiar archivo temporal
                        fs.unlinkSync(file.path);

                        res.json({
                            message: 'Cumplido subido y registrado exitosamente',
                            path: drivePath,
                            link: driveLink,
                            folderFileCount: fileCount
                        });
                    } catch (dbErr) {
                        console.error('[CUMPLIDOS] Error DB:', dbErr);
                        res.status(500).json({ error: 'Error al procesar el registro y notificaciones' });
                    }
                });
            });
        });

    } catch (err) {
        console.error('[CUMPLIDOS] Error general:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

export const getDocumentStats = async (req: Request, res: Response) => {
    try {
        const stats = await pool.query(`
            SELECT 
                c.name as client_name,
                COUNT(d.id) as total_uploads,
                MAX(d.upload_date) as last_upload
            FROM document_logs d
            JOIN clients c ON d.client_id = c.id
            GROUP BY c.name
            ORDER BY total_uploads DESC
        `);
        res.json(stats.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};
