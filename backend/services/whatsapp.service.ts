
import dotenv from 'dotenv';

dotenv.config();

const EVO_URL = process.env.EVO_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'Milla7';

let connectionStatus: 'DISCONNECTED' | 'QR_READY' | 'CONNECTED' = 'DISCONNECTED';
let cachedQRCode: string | null = null;
let lastQRUpdate: number = 0;

/**
 * Obtiene el código QR para vincular WhatsApp
 */
export const getQRCode = async (): Promise<string | null> => {
    try {
        // Si tenemos un QR cacheado y es reciente (menos de 30 segundos), retornarlo
        const now = Date.now();
        if (cachedQRCode && (now - lastQRUpdate) < 30000) {
            return cachedQRCode;
        }

        const response = await fetch(`${EVO_URL}/instance/connect/${EVO_INSTANCE}`, {
            headers: { 'apikey': EVO_KEY }
        });

        if (!response.ok) {
            console.error('[M7-WHATSAPP] Error obteniendo QR:', response.statusText);
            return null;
        }

        const data: any = await response.json();
        
        // Evolution API puede retornar el QR en diferentes formatos
        if (data.qrcode?.base64) {
            cachedQRCode = data.qrcode.base64;
            lastQRUpdate = now;
            connectionStatus = 'QR_READY';
            return cachedQRCode;
        } else if (data.base64) {
            cachedQRCode = data.base64;
            lastQRUpdate = now;
            connectionStatus = 'QR_READY';
            return cachedQRCode;
        } else if (data.code) {
            cachedQRCode = data.code;
            lastQRUpdate = now;
            connectionStatus = 'QR_READY';
            return cachedQRCode;
        }

        return null;
    } catch (error) {
        console.error('[M7-WHATSAPP] Error al obtener QR code:', error);
        return null;
    }
};

/**
 * Verifica el estado de conexión de la instancia
 */
export const checkEvolutionConnection = async () => {
    try {
        const response = await fetch(`${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`, {
            headers: { 'apikey': EVO_KEY }
        });
        
        if (!response.ok) {
            console.error('[M7-WHATSAPP] Error verificando conexión:', response.statusText);
            connectionStatus = 'DISCONNECTED';
            return connectionStatus;
        }

        const data: any = await response.json();
        
        if (data.instance?.state === 'open') {
            connectionStatus = 'CONNECTED';
            cachedQRCode = null; // Limpiar QR si ya está conectado
        } else if (data.instance?.state === 'connecting') {
            connectionStatus = 'QR_READY';
        } else {
            connectionStatus = 'DISCONNECTED';
        }
    } catch (error) {
        console.error('[M7-WHATSAPP] Error al verificar conexión con Evolution:', error);
        connectionStatus = 'DISCONNECTED';
    }
    return connectionStatus;
};

/**
 * Obtiene el estado completo de la conexión incluyendo QR si está disponible
 */
export const getConnectionStatus = async () => {
    const status = await checkEvolutionConnection();
    
    let qr: string | null = null;
    
    // Si no está conectado, intentar obtener el QR
    if (status !== 'CONNECTED') {
        qr = await getQRCode();
    }
    
    return {
        status,
        qr
    };
};

/**
 * Fuerza la reconexión de la instancia
 */
export const connectInstance = async () => {
    try {
        console.log('[M7-WHATSAPP] Iniciando conexión de instancia...');
        
        const response = await fetch(`${EVO_URL}/instance/connect/${EVO_INSTANCE}`, {
            headers: { 'apikey': EVO_KEY }
        });

        if (!response.ok) {
            throw new Error(`Error al conectar instancia: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[M7-WHATSAPP] Respuesta de conexión:', data);
        
        return await getConnectionStatus();
    } catch (error) {
        console.error('[M7-WHATSAPP] Error al conectar instancia:', error);
        throw error;
    }
};

/**
 * Envía un mensaje de WhatsApp
 */
export const sendWhatsAppMessage = async (number: string, text: string) => {
    // Limpiar número (solo dígitos y código de país)
    const cleanNumber = number.replace(/\D/g, '');
    
    try {
        const response = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVO_KEY
            },
            body: JSON.stringify({
                number: cleanNumber,
                text: text,
                delay: 1200,
                linkPreview: true
            })
        });

        const data = await response.json();
        console.log('[M7-WHATSAPP] Resultado envío:', data);
        return data;
    } catch (error) {
        console.error('[M7-WHATSAPP] Error enviando mensaje:', error);
        throw error;
    }
};

/**
 * Inicializa el servicio de WhatsApp
 */
export const initWhatsApp = async () => {
    console.log('[M7-WHATSAPP] Iniciando integración con Evolution API...');
    console.log(`[M7-WHATSAPP] URL: ${EVO_URL}`);
    console.log(`[M7-WHATSAPP] Instancia: ${EVO_INSTANCE}`);
    
    const statusInfo = await getConnectionStatus();
    console.log(`[M7-WHATSAPP] Estado inicial: ${statusInfo.status}`);
    
    if (statusInfo.status !== 'CONNECTED') {
        console.log('[M7-WHATSAPP] ⚠️  Instancia no conectada. Escanea el QR desde el panel de administración.');
    } else {
        console.log('[M7-WHATSAPP] ✅ Instancia conectada y lista para enviar mensajes.');
    }
};

/**
 * Obtiene el estado simple del bot (legacy)
 */
export const getBotStatus = () => ({ status: connectionStatus });
