
import dotenv from 'dotenv';

dotenv.config();

const EVO_URL = process.env.EVO_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'Milla7';

let connectionStatus: 'DISCONNECTED' | 'QR_READY' | 'CONNECTED' = 'DISCONNECTED';

export const checkEvolutionConnection = async () => {
    try {
        const response = await fetch(`${EVO_URL}/instance/connectionState/${EVO_INSTANCE}`, {
            headers: { 'apikey': EVO_KEY }
        });
        
        const data: any = await response.json();
        
        if (data.instance?.state === 'open') {
            connectionStatus = 'CONNECTED';
        } else {
            connectionStatus = 'DISCONNECTED';
        }
    } catch (error) {
        console.error('[M7-WHATSAPP] Error al verificar conexión con Evolution:', error);
        connectionStatus = 'DISCONNECTED';
    }
    return connectionStatus;
};

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

export const initWhatsApp = async () => {
    console.log('[M7-WHATSAPP] Iniciando integración con Evolution API...');
    await checkEvolutionConnection();
    console.log(`[M7-WHATSAPP] Estado inicial: ${connectionStatus}`);
};

export const getBotStatus = () => ({ status: connectionStatus });
