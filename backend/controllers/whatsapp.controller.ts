
import { Request, Response } from 'express';
import { evolutionService } from '../services/evolution.service.js';
import pool from '../config/database.js';

/**
 * Obtiene el estado de conexión de WhatsApp incluyendo QR si está disponible
 * GET /api/whatsapp/status?userId=XXX
 */
export const getStatus = async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  try {
    const statusInfo = await evolutionService.getQR(`user_${userId}`);
    res.json(statusInfo);
  } catch (err: any) {
    console.error('[M7-WHATSAPP-CTRL] Error obteniendo estado:', err);
    res.status(500).json({ 
      error: "No se pudo obtener el estado del bot",
    });
  }
};

/**
 * Fuerza la reconexión de la sesión
 * POST /api/whatsapp/connect
 */
export const reconnect = async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  try {
    const statusInfo = await evolutionService.forceNewQR(`user_${userId}`);
    res.json({ success: true, ...statusInfo });
  } catch (err: any) {
    console.error('[M7-WHATSAPP-CTRL] Error al iniciar sesión:', err);
    res.status(500).json({ success: false, error: "No se pudo iniciar la sesión" });
  }
};

/**
 * Cierra la sesión (Logout / Desvincular)
 * POST /api/whatsapp/disconnect
 */
export const disconnect = async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Falta userId" });

    try {
      await evolutionService.logout(`user_${userId}`);
      res.json({ success: true, message: 'Sesión cerrada y desvinculada' });
    } catch (err: any) {
      console.error('[M7-WHATSAPP-CTRL] Error al desconectar:', err);
      res.status(500).json({ 
        success: false, 
        error: "No se pudo desconectar la sesión", 
        });
    }
};

/**
 * Obtiene el historial de mensajes
 */
export const getHistory = async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    try {
        const query = userId 
            ? 'SELECT * FROM whatsapp_logs WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 50'
            : 'SELECT * FROM whatsapp_logs ORDER BY sent_at DESC LIMIT 50';
        const params = userId ? [userId] : [];
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err: any) {
        console.error('[M7-WHATSAPP-CTRL] Error obteniendo historial:', err);
        res.status(500).json({ 
            error: "Error recuperando historial", 
              });
    }
};

/**
 * Obtiene los chats activos del usuario
 */
export const getChats = async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "Falta userId" });
    try {
        const chats = await evolutionService.getChats(userId);
        res.json(chats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Fuerza la sincronización de contactos
 */
export const syncContacts = async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Falta userId" });
    try {
        const result = await evolutionService.syncContacts(userId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Obtiene mensajes de un chat específico
 */
export const getChatMessages = async (req: Request, res: Response) => {
    const { userId, remoteJid } = req.query;
    if (!userId || !remoteJid) return res.status(400).json({ error: "Faltan parámetros" });
    
    try {
        const phone = (remoteJid as string).split('@')[0];
        
        // 1. Obtener mensajes de la API
        const apiMessages = await evolutionService.getMessages(userId as string, remoteJid as string);
        
        // 2. Obtener logs de M7 para este número (solo los que no estén en la API para evitar duplicados)
        // Usamos external_message_id para intentar matchear si es posible
        const logResult = await pool.query(
            'SELECT * FROM whatsapp_logs WHERE user_id = $1 AND (phone_number = $2 OR phone_number = $3) ORDER BY sent_at DESC LIMIT 20',
            [userId, phone, remoteJid]
        );

        // 3. Formatear logs locales al estilo de Evolution API para que el frontend los entienda
        const mappedLogs = logResult.rows.map(log => ({
            key: { 
                remoteJid: remoteJid, 
                fromMe: log.direction === 'OUTBOUND', 
                id: log.external_message_id || `m7_${log.id}` 
            },
            message: { conversation: log.message_body },
            messageTimestamp: Math.floor(new Date(log.sent_at).getTime() / 1000),
            status: log.status
        }));

        // 4. Combinar y de-duplicar (por ID de mensaje si existe)
        const allMessages = [...apiMessages];
        const apiMessageIds = new Set(apiMessages.map((m: any) => m.key?.id));
        
        mappedLogs.forEach(log => {
            if (!apiMessageIds.has(log.key.id)) {
                allMessages.push(log);
            }
        });

        // Ordenar por tiempo (más reciente primero para el reverse del frontend)
        res.json(allMessages.sort((a, b) => b.messageTimestamp - a.messageTimestamp));

    } catch (err: any) {
        console.error('[M7-MSG-MERGE-ERR]:', err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Envia notificaciones masivas o con multimedia
 */
export const sendNotification = async (req: Request, res: Response) => {
    try {
        const { phones, message, userId, media, fileName } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: "El userId es requerido para identificar la línea de salida" });
        }
        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({ error: "Lista de teléfonos inválida o vacía" });
        }

        console.log(`[M7-NOTIFY] Iniciando envío masivo a ${phones.length} destinatarios desde user_${userId}... media? ${!!media}`);
        
        const results = { sent: 0, failed: 0, details: [] as any[] };
        
        for (const phone of phones) {
            try {
                if (media) {
                    await evolutionService.sendMedia(userId, phone, media, fileName || 'archivo', message);
                } else {
                    await evolutionService.sendMessage(userId, phone, message);
                }
                results.sent++;
            } catch (error: any) {
                results.failed++;
                results.details.push({ phone, error: error.message });
            }
            // Pequeño delay para no saturar si son muchos
            await new Promise(r => setTimeout(r, media ? 1500 : 500));
        }
        
        res.json({ 
            success: true, 
            message: `Proceso finalizado. Enviados: ${results.sent}, Fallidos: ${results.failed}`,
            results 
        });

    } catch (err: any) {
        console.error('[M7-WHATSAPP-CTRL] Error en envío masivo:', err);
        res.status(500).json({ error: "Error procesando envío masivo" });
    }
};

/**
 * CRUD para Quick Replies
 */
export const getQuickReplies = async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "Falta userId" });
    try {
        const result = await pool.query('SELECT * FROM whatsapp_quick_replies WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const saveQuickReply = async (req: Request, res: Response) => {
    const { userId, title, content } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO whatsapp_quick_replies (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
            [userId, title, content]
        );
        res.json(result.rows[0]);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteQuickReply = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM whatsapp_quick_replies WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
