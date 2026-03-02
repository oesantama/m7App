
import axios from 'axios';
import dotenv from 'dotenv';
import pool from '../config/database.js';

dotenv.config();

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://evolution:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || 'B3B896F8-9862-4467-9C17-A038848C1726';

export class EvolutionService {
    private initializationLocks: Map<string, Promise<string | null>> = new Map();

    private getHeaders() {
        return {
            'apikey': EVO_KEY,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Asegura que una instancia exista y esté conectada
     */
    async ensureInstance(instanceName: string): Promise<string | null> {
        if (this.initializationLocks.has(instanceName)) {
            return this.initializationLocks.get(instanceName)!;
        }

        const initPromise = (async () => {
            try {
                console.log(`[EVO] Checking instance: ${instanceName}`);
                const response = await axios.get(`${EVO_URL}/instance/connectionState/${instanceName}`, {
                    headers: this.getHeaders(),
                    timeout: 10000
                });

                const status = (response.data?.instance?.state || response.data?.instance?.status || '').toUpperCase();
                if (['OPEN', 'CONNECTED'].includes(status)) {
                    return null; // Already connected
                }
            } catch (e: any) {
                if (e.response?.status === 404) {
                    console.log(`[EVO] Creating instance: ${instanceName}`);
                    const createRes = await axios.post(`${EVO_URL}/instance/create`, {
                        instanceName: instanceName,
                        qrcode: true
                    }, {
                        headers: this.getHeaders()
                    });
                    
                    return createRes.data?.qrcode?.base64 || createRes.data?.qrcode || null;
                }
            }
            return null;
        })();

        this.initializationLocks.set(instanceName, initPromise);
        try {
            return await initPromise;
        } finally {
            this.initializationLocks.delete(instanceName);
        }
    }

    /**
     * Obtiene el QR para una sesión específica
     */
    async getQR(sessionName: string) {
        try {
            const state = await this.ensureInstance(sessionName);
            if (state) {
                return { status: 'SCAN_QR', qr: state.startsWith('data:image') ? state : `data:image/png;base64,${state}` };
            }

            // If no QR but instance exists, try to connect to get one
            const qrUrl = `${EVO_URL}/instance/connect/${sessionName}`;
            const response = await axios.get(qrUrl, { headers: this.getHeaders() });
            const qrData = response.data?.base64 || response.data?.qrcode || response.data?.code;

            if (qrData) {
                return { status: 'SCAN_QR', qr: qrData.startsWith('data:image') ? qrData : `data:image/png;base64,${qrData}` };
            }

            return { status: 'CONNECTED' };
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            if (msg?.includes('already connected')) return { status: 'CONNECTED' };
            return { status: 'ERROR', message: msg };
        }
    }

    /**
     * Envía mensaje de texto
     */
    async sendMessage(userId: string, number: string, text: string) {
        const sessionName = `user_${userId}`;
        const cleanNumber = number.replace(/\D/g, '');
        const finalNumber = (cleanNumber.length === 10) ? '57' + cleanNumber : cleanNumber;

        try {
            const url = `${EVO_URL}/message/sendText/${sessionName}`;
            const payload = {
                number: finalNumber,
                textMessage: { text },
                delay: 1200
            };

            const response = await axios.post(url, payload, { headers: this.getHeaders() });
            await this.logMessage(userId, finalNumber, text, 'SENT', 'OUTBOUND', response.data?.key?.id);
            return response.data;
        } catch (error: any) {
            console.error(`[EVo-FAIL] ${sessionName} -> ${finalNumber}:`, error.message);
            await this.logMessage(userId, finalNumber, text, 'FAILED', 'OUTBOUND', null, error.message);
            throw error;
        }
    }

    /**
     * Envía media (Imagen, PDF, Audio)
     */
    async sendMedia(userId: string, number: string, base64: string, fileName: string, caption?: string) {
        const sessionName = `user_${userId}`;
        const cleanNumber = number.replace(/\D/g, '');
        const finalNumber = (cleanNumber.length === 10) ? '57' + cleanNumber : cleanNumber;
        
        // Detectar tipo de media por base64
        let mediaType = 'image';
        if (base64.includes('application/pdf')) mediaType = 'document';
        else if (base64.includes('audio/')) mediaType = 'audio';
        else if (base64.includes('video/')) mediaType = 'video';

        try {
            const url = `${EVO_URL}/message/sendMedia/${sessionName}`;
            const payload = {
                number: finalNumber,
                mediaMessage: {
                    mediatype: mediaType,
                    caption: caption || fileName,
                    media: base64,
                    fileName: fileName
                },
                delay: 1200
            };

            const response = await axios.post(url, payload, { headers: this.getHeaders() });
            await this.logMessage(userId, finalNumber, `[MEDIA: ${fileName}] ${caption || ''}`, 'SENT', 'OUTBOUND', response.data?.key?.id);
            return response.data;
        } catch (error: any) {
            console.error(`[EVo-MEDIA-FAIL] ${sessionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene los chats recientes
     */
    /**
     * Obtiene los contactos de la instancia
     */
    async getContacts(userId: string) {
        const sessionName = `user_${userId}`;
        try {
            const response = await axios.get(`${EVO_URL}/contact/findContacts/${sessionName}`, { headers: this.getHeaders() });
            return Array.isArray(response.data) ? response.data : (response.data?.records || []);
        } catch (error: any) {
            console.error(`[EVO-CONTACTS-ERR] ${sessionName}:`, error.message);
            return [];
        }
    }

    /**
     * Obtiene los chats activos del usuario fusionando con contactos y logs
     */
    async getChats(userId: string) {
        const sessionName = `user_${userId}`;
        try {
            // 1. Obtener chats, contactos y logs en paralelo
            const [chatsRes, contactsRes, logsRes] = await Promise.all([
                axios.get(`${EVO_URL}/chat/findChats/${sessionName}`, { headers: this.getHeaders() }).catch(() => ({ data: [] })),
                axios.get(`${EVO_URL}/contact/findContacts/${sessionName}`, { headers: this.getHeaders() }).catch(() => ({ data: [] })),
                pool.query(
                    `SELECT DISTINCT phone_number, MAX(sent_at) as last_date 
                     FROM whatsapp_logs 
                     WHERE user_id = $1 AND LENGTH(phone_number) > 5 AND phone_number != '0'
                     GROUP BY phone_number 
                     ORDER BY last_date DESC`, 
                    [userId]
                ).catch(() => ({ rows: [] }))
            ]);

            const apiChats = Array.isArray(chatsRes.data) ? chatsRes.data : (chatsRes.data?.records || []);
            const contacts = Array.isArray(contactsRes.data) ? contactsRes.data : (contactsRes.data?.records || []);
            const logs = (logsRes as any).rows || [];

            // 2. Crear mapa de contactos para resolución de nombres
            const contactMap = new Map();
            contacts.forEach((c: any) => {
                const jid = c.id || c.remoteJid || c.jid || '';
                if (jid) {
                    // Priorizar nombres guardados en el teléfono
                    const name = c.name || c.fullName || c.verifiedName || c.pushName || c.pushname || '';
                    if (name) contactMap.set(jid, name);
                }
            });

            // 3. Crear mapa final de chats
            const chatMap = new Map();
            
            // Procesar chats de la API (incluye grupos)
            apiChats.forEach((chat: any) => {
                const jid = chat.id || chat.remoteJid || '';
                if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us')) {
                    const phone = jid.split('@')[0];
                    if (phone.length > 5 && phone !== '0') {
                        // REGLA DE NOMBRES:
                        // 1. Nombre en contactos (Agenda)
                        // 2. Nombre del grupo (Subject)
                        // 3. Nombre del chat de la API
                        // 4. Push name de la API
                        // 5. Número de teléfono
                        const isGroup = jid.endsWith('@g.us');
                        const resolvedName = contactMap.get(jid) 
                            || (isGroup ? chat.subject : null)
                            || chat.name 
                            || chat.pushName 
                            || chat.pushname 
                            || phone;
                        
                        chatMap.set(jid, {
                            id: jid,
                            name: resolvedName,
                            lastMessage: chat.lastMessage,
                            timestamp: chat.lastMessage?.messageTimestamp || 0,
                            isGroup
                        });
                    }
                }
            });

            // Complementar con logs locales (para ver lo enviado aunque no haya chat activo)
            logs.forEach((row: any) => {
                const phone = row.phone_number;
                const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
                
                if (!chatMap.has(jid)) {
                    chatMap.set(jid, {
                        id: jid,
                        name: contactMap.get(jid) || phone,
                        lastMessage: { message: { conversation: 'Enviado desde M7' } },
                        timestamp: Math.floor(new Date(row.last_date).getTime() / 1000),
                        isGroup: jid.endsWith('@g.us')
                    });
                }
            });

            return Array.from(chatMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        } catch (error: any) {
            console.error(`[EVO-CHATS-REF-ERR] ${sessionName}:`, error.message);
            return [];
        }
    }

    /**
     * Fuerza la sincronización de contactos en la API
     */
    async syncContacts(userId: string) {
        const sessionName = `user_${userId}`;
        try {
            // Evolution v1.x suele tener esta ruta para forzar el fetch de la agenda
            await axios.post(`${EVO_URL}/contact/syncContacts/${sessionName}`, {}, { headers: this.getHeaders() });
            return { success: true };
        } catch (error: any) {
            console.error(`[EVO-SYNC-CONTACTS-ERR] ${sessionName}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene los mensajes de un chat específico
     */
    async getMessages(userId: string, remoteJid: string) {
        const sessionName = `user_${userId}`;
        try {
            const response = await axios.get(`${EVO_URL}/chat/findMessages/${sessionName}?remoteJid=${remoteJid}&count=50`, { headers: this.getHeaders() });
            // Evolution v2 suele devolver { messages: [] } o el array directo
            const messages = Array.isArray(response.data) ? response.data : (response.data?.messages || response.data?.records || []);
            return messages;
        } catch (error: any) {
            console.error(`[EVO-MSG-ERR] ${sessionName}:`, error.message);
            return [];
        }
    }

    async getProfile(userId: string) {
        const sessionName = `user_${userId}`;
        try {
            const response = await axios.get(`${EVO_URL}/instance/connectionState/${sessionName}`, { headers: this.getHeaders() });
            return response.data;
        } catch (e) {
            return null;
        }
    }

    /**
     * Cierra sesión
     */
    async logout(sessionName: string) {
        try {
            await axios.delete(`${EVO_URL}/instance/logout/${sessionName}`, { headers: this.getHeaders() });
            return { success: true };
        } catch (e: any) {
            try {
                await axios.delete(`${EVO_URL}/instance/delete/${sessionName}`, { headers: this.getHeaders() });
                return { success: true };
            } catch (err) {
                return { success: false, error: e.message };
            }
        }
    }

    private async logMessage(userId: string, phone: string, body: string, status: string, direction: string, externalId: string | null = null, error: string | null = null) {
        try {
            const query = `INSERT INTO whatsapp_logs (user_id, phone_number, message_body, status, direction, external_message_id, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
            await pool.query(query, [userId, phone, body, status, direction, externalId, error]);
        } catch (dbError) {
            console.error("Error logging message:", dbError);
        }
    }
}

export const evolutionService = new EvolutionService();
