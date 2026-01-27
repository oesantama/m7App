
import { Request, Response } from 'express';
import { getConnectionStatus, connectInstance } from '../services/whatsapp.service.js';

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
 * Fuerza la reconexión de la instancia de WhatsApp
 */
export const reconnect = async (req: Request, res: Response) => {
  try {
    const statusInfo = await connectInstance();
    res.json({ 
      success: true, 
      message: 'Reconexión iniciada',
      ...statusInfo 
    });
  } catch (err: any) {
    console.error('[M7-WHATSAPP-CTRL] Error al reconectar:', err);
    res.status(500).json({ 
      success: false,
      error: "No se pudo reconectar la instancia",
      details: err.message 
    });
  }
};
