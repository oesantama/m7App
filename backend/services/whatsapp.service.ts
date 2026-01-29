
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const WAHA_URL = process.env.EVO_API_URL || 'http://localhost:3000';
const SESSION_NAME = process.env.WAHA_SESSION_NAME || 'default';
const API_KEY = process.env.WAHA_API_KEY || '';

const getHeaders = () => {
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (API_KEY) {
        headers['X-Api-Key'] = API_KEY;
    }
    return headers;
};

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

interface WahaSessionStatus {
    name: string;
    status: 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED';
}

export const getQRCode = async (): Promise<string | null> => {
    try {
        // Mejorado: Obtener JSON del endpoint de Auth QR que es más confiable
        const response = await fetch(`${WAHA_URL}/api/${SESSION_NAME}/auth/qr?format=image`, {
            headers: getHeaders()
        });
        if (!response.ok) return null;
        
        // WAHA puede devolver la imagen binaria directamente
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        return null;
    }
};

const ensureSessionStarted = async () => {
    try {
        // 1. Verificar si existe
        const checkRes = await fetch(`${WAHA_URL}/api/sessions/${SESSION_NAME}`, {
            headers: getHeaders()
        });
        
        if (checkRes.status === 404) {
            console.log(`[M7-WAHA] Sesión no encontrada. Creando...`);
            await fetch(`${WAHA_URL}/api/sessions`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ name: SESSION_NAME, config: { proxy: null } })
            });
            return; // Esperar siguiente ciclo
        }

        const session = await checkRes.json();
        
        if (session.status === 'STOPPED') {
            console.log(`[M7-WAHA] Sesión detenida. Iniciando...`);
            await fetch(`${WAHA_URL}/api/sessions/${SESSION_NAME}/start`, { 
                method: 'POST',
                headers: getHeaders()
            });
        } else if (session.status === 'FAILED') {
            console.log(`[M7-WAHA] Sesión fallida. Reiniciando...`);
            // Stop first just in case
            await fetch(`${WAHA_URL}/api/sessions/${SESSION_NAME}/stop`, { 
                method: 'POST',
                headers: getHeaders()
            });
            await fetch(`${WAHA_URL}/api/sessions/${SESSION_NAME}/start`, { 
                method: 'POST',
                headers: getHeaders()
            });
        }
    } catch (e) {
        console.error('[M7-WAHA] Error ensureSessionStarted:', e);
    }
};

export const getConnectionStatus = async () => {
    try {
        // AUTO-ARRANQUE: Intentar asegurar que la sesión exista y corra
        await ensureSessionStarted();

        // Dar un breve respiro si acabamos de iniciar algo
        // await new Promise(r => setTimeout(r, 1000));

        const response = await fetch(`${WAHA_URL}/api/sessions?all=true`, {
            headers: getHeaders()
        });
        if (!response.ok) return { status: 'DISCONNECTED', qr: null };
        
        const sessions: WahaSessionStatus[] = await response.json();
        const session = sessions.find(s => s.name === SESSION_NAME);
        
        if (!session) return { status: 'DISCONNECTED', qr: null };

        let status: 'DISCONNECTED' | 'QR_READY' | 'CONNECTED' = 'DISCONNECTED';
        let qr: string | null = null;

        if (session.status === 'WORKING') {
            status = 'CONNECTED';
        } else if (session.status === 'SCAN_QR_CODE') {
            status = 'QR_READY';
            qr = await getQRCode();
        } else if (session.status === 'STARTING') {
             // Si está iniciando, podemos decir que está casi listo para QR
             status = 'DISCONNECTED'; // El frontend mostrará "Cargando..." si el status es null/loading o podemos manejar un estado intermedio
        }

        return { status, qr };
    } catch (error) {
        console.error('[M7-WAHA] Error status:', error);
        return { status: 'DISCONNECTED', qr: null };
    }
};

export const startSession = async () => {
    // Ya está cubierto por ensureSessionStarted, pero mantenemos por compatibilidad
    await ensureSessionStarted();
    return await getConnectionStatus();
};

export const logoutSession = async () => {
    try {
        await fetch(`${WAHA_URL}/api/sessions/${SESSION_NAME}/logout`, { 
            method: 'POST',
            headers: getHeaders()
        });
        return { success: true };
    } catch (error) {
        throw error;
    }
};

export const sendWhatsAppMessage = async (number: string, text: string) => {
    const cleanNumber = number.replace(/\D/g, '');
    const chatId = `${cleanNumber}@c.us`;
    try {
        const response = await fetch(`${WAHA_URL}/api/send/text`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ session: SESSION_NAME, chatId: chatId, text: text })
        });
        
        const data = await response.json().catch(() => ({})); // Handle non-json errors
        
        if (!response.ok) {
            console.error('[M7-WAHA-ERROR] Response:', { status: response.status, body: data });
            const errorDetail = data.details || data.error || data.message || `HTTP ${response.status}`;
            throw new Error(`Waha Error: ${errorDetail}`);
        }
        
        await logMessage(cleanNumber, text, 'SENT', 'OUTBOUND', data.id);
        return data;
    } catch (error: any) {
        console.error(`[M7-WAHA-FAIL] Failed sending to ${chatId}:`, error.message);
        await logMessage(cleanNumber, text, 'FAILED', 'OUTBOUND', null, error.message);
        throw error;
    }
};

const logMessage = async (phone: string, body: string, status: string, direction: string, wahaId: string | null = null, error: string | null = null) => {
    try {
        const query = `INSERT INTO whatsapp_logs (phone_number, message_body, status, direction, waha_message_id, error_message) VALUES ($1, $2, $3, $4, $5, $6)`;
        await pool.query(query, [phone, body, status, direction, wahaId, error]);
    } catch (dbError) {}
};

export const getMessageHistory = async (limit = 50) => {
    try {
        const result = await pool.query(`SELECT * FROM whatsapp_logs ORDER BY sent_at DESC LIMIT $1`, [limit]);
        return result.rows;
    } catch (error) {
        return [];
    }
};

export const initWhatsApp = async () => {
    console.log('[M7-WHATSAPP] Re-inicializando servicio WAHA...');
    startSession().catch(() => {});
};
