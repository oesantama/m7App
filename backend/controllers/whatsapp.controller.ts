
import { Request, Response } from 'express';
import { getConnectionStatus, startSession, logoutSession, getMessageHistory } from '../services/whatsapp.service.js';

/**
 * Obtiene el estado de conexión de WhatsApp incluyendo QR si está disponible
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const statusInfo = await getConnectionStatus();
    res.json(statusInfo);
  } catch (err: any) {
    console.error('[M7-WHATSAPP-CTRL] Error obteniendo estado:', err);
    res.status(500).json({ 
      error: "No se pudo obtener el estado del bot",
      details: err.message 
    });
  }
};

/**
 * Fuerza la reconexión de la sesión (Start Session)
 */
export const reconnect = async (req: Request, res: Response) => {
  try {
    const statusInfo = await startSession();
    res.json({ 
      success: true, 
      message: 'Sesión iniciada',
      ...statusInfo 
    });
  } catch (err: any) {
    console.error('[M7-WHATSAPP-CTRL] Error al iniciar sesión:', err);
    res.status(500).json({ 
      success: false,
      error: "No se pudo iniciar la sesión",
      details: err.message 
    });
  }
};

/**
 * Cierra la sesión (Logout / Desvincular)
 */
export const disconnect = async (req: Request, res: Response) => {
    try {
      await logoutSession();
      res.json({ success: true, message: 'Sesión cerrada y desvinculada' });
    } catch (err: any) {
      console.error('[M7-WHATSAPP-CTRL] Error al desconectar:', err);
      res.status(500).json({ 
        success: false, 
        error: "No se pudo desconectar la sesión", 
        details: err.message 
      });
    }
};

/**
 * Obtiene el historial de mensajes
 */
export const getHistory = async (req: Request, res: Response) => {
    try {
        const history = await getMessageHistory();
        res.json(history);
    } catch (err: any) {
        console.error('[M7-WHATSAPP-CTRL] Error obteniendo historial:', err);
        res.status(500).json({ 
            error: "Error recuperando historial", 
            details: err.message 
        });
    }
};

/**
 * Envia notificaciones masivas
 */
export const sendNotification = async (req: Request, res: Response) => {
    try {
        const { phones, message } = req.body;
        
        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({ error: "Lista de teléfonos inválida o vacía" });
        }
        if (!message) {
            return res.status(400).json({ error: "El mensaje es requerido" });
        }

        console.log(`[M7-NOTIFY] Iniciando envío masivo a ${phones.length} destinatarios...`);
        
        const results = { sent: 0, failed: 0, details: [] as any[] };
        
        // Procesamiento secuencial para no saturar
        for (const phone of phones) {
            try {
                // Normalización de teléfono (Soporte Colombia)
                let cleanPhone = phone.replace(/\D/g, '');
                
                // Si tiene 10 dígitos (ej: 3001234567), asumimos Colombia y agregamos 57
                if (cleanPhone.length === 10) {
                    cleanPhone = '57' + cleanPhone;
                }

                if (cleanPhone.length < 10) {
                    results.failed++;
                    results.details.push({ phone, error: 'Número inválido (muy corto)' });
                    continue;
                }
                
                // Importar dinámicamente o asegurarse de que está disponible
                // Usamos la importación del tope del archivo si es posible, si no, la movemos
                const { sendWhatsAppMessage } = await import('../services/whatsapp.service.js');
                await sendWhatsAppMessage(cleanPhone, message);
                results.sent++;
            } catch (error: any) {
                results.failed++;
                results.details.push({ phone, error: error.message });
            }
            // Pequeña pausa para evitar rate limiting excesivo
            await new Promise(r => setTimeout(r, 500));
        }
        
        res.json({ 
            success: true, 
            message: `Proceso finalizado. Enviados: ${results.sent}, Fallidos: ${results.failed}`,
            results 
        });

    } catch (err: any) {
        console.error('[M7-WHATSAPP-CTRL] Error en envío masivo:', err);
        res.status(500).json({ error: "Error procesando envío masivo", details: err.message });
    }
};
