
import axios from 'axios';
import dotenv from 'dotenv';
import pool from '../config/database.js';

dotenv.config();

const EVO_URL = process.env.EVOLUTION_API_URL || 'http://evolution:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || 'B3B896F8-9862-4467-9C17-A038848C1726';

type QrStatus = 'DISCONNECTED' | 'CONNECTING' | 'SCAN_QR' | 'CONNECTED' | 'ERROR';

interface QrCache {
    status: QrStatus;
    qr: string | null;
    ownerJid: string | null;
    ts: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class EvolutionService {
    private qrCache: Map<string, QrCache> = new Map();
    private refreshLocks: Map<string, Promise<void>> = new Map();
    private readonly QR_TTL_MS = 50_000;

    private getHeaders() {
        return { 'apikey': EVO_KEY, 'Content-Type': 'application/json' };
    }

    /**
     * Verifica el estado actual de una instancia sin crearla
     */
    private async checkInstanceState(instanceName: string): Promise<{ state: string; ownerJid?: string } | null> {
        try {
            const res = await axios.get(`${EVO_URL}/instance/connectionState/${instanceName}`, {
                headers: this.getHeaders(), timeout: 8000
            });
            const state = (res.data?.instance?.state || '').toLowerCase();

            // Si está open, intentar obtener ownerJid
            if (state === 'open') {
                try {
                    const instances = await axios.get(`${EVO_URL}/instance/fetchInstances`, {
                        headers: this.getHeaders(), timeout: 6000
                    });
                    const found = (instances.data || []).find((i: any) => i.name === instanceName);
                    return { state: 'open', ownerJid: found?.ownerJid || null };
                } catch {
                    return { state: 'open' };
                }
            }

            return { state };
        } catch (e: any) {
            if (e.response?.status === 404) return null; // No existe
            throw e;
        }
    }

    /**
     * Obtiene el QR o estado de conexión de una sesión.
     * Evolution v2 NUNCA cambia a estado 'qrcode' — siempre es 'connecting'.
     * El QR se obtiene vía /instance/connect cuando count > 0.
     */
    async getQR(sessionName: string): Promise<{ status: QrStatus; qr?: string; ownerJid?: string }> {
        const cached = this.qrCache.get(sessionName);
        const now = Date.now();

        if (cached && (now - cached.ts) < this.QR_TTL_MS) {
            // Si tiene QR activo, verificar si ya escaneó (sin esperar que expire el TTL)
            if (cached.status === 'SCAN_QR') {
                try {
                    const liveState = await this.checkInstanceState(sessionName);
                    if (liveState?.state === 'open') {
                        this.qrCache.set(sessionName, { status: 'CONNECTED', qr: null, ownerJid: liveState.ownerJid || null, ts: now });
                        return { status: 'CONNECTED', ...(liveState.ownerJid ? { ownerJid: liveState.ownerJid } : {}) };
                    }
                } catch { /* ignorar, retornar caché */ }
            }
            return {
                status: cached.status,
                ...(cached.qr ? { qr: cached.qr } : {}),
                ...(cached.ownerJid ? { ownerJid: cached.ownerJid } : {}),
            };
        }

        try {
            const instanceState = await this.checkInstanceState(sessionName);

            if (!instanceState) {
                this.qrCache.set(sessionName, { status: 'DISCONNECTED', qr: null, ownerJid: null, ts: now });
                return { status: 'DISCONNECTED' };
            }

            const { state, ownerJid } = instanceState;

            if (state === 'open') {
                this.qrCache.set(sessionName, { status: 'CONNECTED', qr: null, ownerJid: ownerJid || null, ts: now });
                return { status: 'CONNECTED', ...(ownerJid ? { ownerJid } : {}) };
            }

            if (state === 'connecting') {
                // Intentar obtener QR directamente (Evolution pone count>0 cuando está listo)
                const qr = await this.fetchQRFromConnect(sessionName);
                if (qr) {
                    this.qrCache.set(sessionName, { status: 'SCAN_QR', qr, ownerJid: null, ts: now });
                    return { status: 'SCAN_QR', qr };
                }
                // QR aún no disponible: lanzar polling y retornar CONNECTING
                this.startBackgroundRefresh(sessionName);
                return { status: 'CONNECTING' };
            }

            // close u otro estado
            this.qrCache.set(sessionName, { status: 'DISCONNECTED', qr: null, ownerJid: null, ts: now });
            return { status: 'DISCONNECTED' };

        } catch (e: any) {
            console.error(`[EVO-GETQR] ${sessionName}:`, e.message);
            return { status: 'ERROR' };
        }
    }

    /**
     * Obtiene el QR base64 desde /instance/connect (Evolution v2).
     * Retorna null si count==0 (QR aún no generado).
     */
    private async fetchQRFromConnect(sessionName: string): Promise<string | null> {
        try {
            const res = await axios.get(`${EVO_URL}/instance/connect/${sessionName}`, {
                headers: this.getHeaders(), timeout: 10000
            });
            const data = res.data;
            // count == 0 significa que el QR aún no está listo
            if (data?.count === 0 || (!data?.base64 && !data?.qrcode?.base64)) return null;
            const raw = data?.base64 || data?.qrcode?.base64 || null;
            if (!raw) return null;
            return raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`;
        } catch {
            return null;
        }
    }

    /**
     * Polling en background: sondea /instance/connect cada 2s hasta que
     * el QR esté disponible (count > 0) o la instancia llegue a 'open'.
     */
    private startBackgroundRefresh(sessionName: string): void {
        if (this.refreshLocks.has(sessionName)) return;

        const p = (async () => {
            console.log(`[EVO] Polling QR for ${sessionName}...`);
            for (let i = 0; i < 25; i++) {
                await sleep(2000);
                try {
                    const state = await this.checkInstanceState(sessionName);
                    if (!state) {
                        this.qrCache.set(sessionName, { status: 'DISCONNECTED', qr: null, ownerJid: null, ts: Date.now() });
                        return;
                    }
                    if (state.state === 'open') {
                        this.qrCache.set(sessionName, { status: 'CONNECTED', qr: null, ownerJid: state.ownerJid || null, ts: Date.now() });
                        console.log(`[EVO] ${sessionName} CONNECTED!`);
                        return;
                    }
                    // state es 'connecting' — intentar obtener QR
                    const qr = await this.fetchQRFromConnect(sessionName);
                    if (qr) {
                        this.qrCache.set(sessionName, { status: 'SCAN_QR', qr, ownerJid: null, ts: Date.now() });
                        console.log(`[EVO] QR ready for ${sessionName}`);
                        return;
                    }
                } catch { /* continuar */ }
            }
            console.warn(`[EVO] QR timeout for ${sessionName}`);
            this.qrCache.set(sessionName, { status: 'ERROR', qr: null, ownerJid: null, ts: Date.now() });
        })().finally(() => this.refreshLocks.delete(sessionName));

        this.refreshLocks.set(sessionName, p);
    }

    /**
     * Crea una nueva instancia y lanza polling del QR en background
     * Devuelve inmediatamente con CONNECTING
     */
    async forceNewQR(sessionName: string): Promise<{ status: QrStatus; qr?: string }> {
        console.log(`[EVO] forceNewQR for ${sessionName}`);

        // Invalidar caché
        this.qrCache.delete(sessionName);
        this.refreshLocks.get(sessionName); // no cancelamos, pero...

        // Intentar borrar instancia existente
        try {
            await axios.delete(`${EVO_URL}/instance/delete/${sessionName}`, {
                headers: this.getHeaders(), timeout: 8000
            });
            console.log(`[EVO] Deleted ${sessionName}`);
        } catch { /* puede no existir */ }

        await sleep(1000);

        // Crear instancia nueva
        try {
            const createRes = await axios.post(`${EVO_URL}/instance/create`, {
                instanceName: sessionName,
                integration: 'WHATSAPP-BAILEYS',
                qrcode: true,
            }, { headers: this.getHeaders(), timeout: 10000 });

            console.log(`[EVO] Created ${sessionName}, hash:`, createRes.data?.hash);

            // Verificar si el QR ya vino en el create response
            const immediateQr = createRes.data?.qrcode?.base64 || createRes.data?.qrcode?.code;
            if (immediateQr && immediateQr.length > 50) {
                const qr = immediateQr.startsWith('data:image') ? immediateQr : `data:image/png;base64,${immediateQr}`;
                this.qrCache.set(sessionName, { status: 'SCAN_QR', qr, ownerJid: null, ts: Date.now() });
                return { status: 'SCAN_QR', qr };
            }

        } catch (e: any) {
            console.error(`[EVO] Create failed for ${sessionName}:`, e.response?.data?.message || e.message);
        }

        // Lanzar polling en background
        this.qrCache.set(sessionName, { status: 'CONNECTING', qr: null, ownerJid: null, ts: Date.now() });
        this.startBackgroundRefresh(sessionName);

        return { status: 'CONNECTING' };
    }

    /**
     * Busca la primera instancia de tipo user_* que esté conectada (state open).
     * Retorna su nombre o null si ninguna está disponible.
     */
    async findFirstConnectedInstance(): Promise<string | null> {
        try {
            const res = await axios.get(`${EVO_URL}/instance/fetchInstances`, {
                headers: this.getHeaders(), timeout: 8000
            });
            const instances: any[] = Array.isArray(res.data) ? res.data : [];
            const found = instances.find(i => {
                const name: string = i.name || '';
                const state: string = (i.connectionStatus || i.state || '').toLowerCase();
                return name.startsWith('user_') && state === 'open';
            });
            return found?.name ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Verifica que una instancia exista y esté conectada (state === 'open').
     * Lanza error descriptivo si no está lista.
     */
    async ensureInstance(instanceName: string): Promise<void> {
        const state = await this.checkInstanceState(instanceName);
        if (!state) {
            throw new Error(`La instancia de WhatsApp "${instanceName}" no existe. Conéctala primero en Conexión WhatsApp.`);
        }
        if (state.state !== 'open') {
            throw new Error(`La instancia de WhatsApp "${instanceName}" no está conectada (estado: ${state.state}). Escanea el QR en Conexión WhatsApp.`);
        }
    }

    /**
     * Envía texto usando el nombre de instancia directamente (sin prefijo user_)
     */
    async sendMessageDirect(instanceName: string, number: string, text: string) {
        const cleanNumber = number.replace(/\D/g, '');
        const finalNumber = cleanNumber.length === 10 ? '57' + cleanNumber : cleanNumber;
        const url = `${EVO_URL}/message/sendText/${instanceName}`;
        // Evolution API v2: campo "text" directo, no "textMessage.text"
        const payload = { number: finalNumber, text, delay: 1200 };
        const response = await axios.post(url, payload, { headers: this.getHeaders() });
        return response.data;
    }

    /**
     * Envía media usando el nombre de instancia directamente (sin prefijo user_)
     * Evolution v2 requiere base64 puro (sin el prefijo data:...;base64,)
     */
    async sendMediaDirect(instanceName: string, number: string, base64: string, fileName: string, caption?: string) {
        const cleanNumber = number.replace(/\D/g, '');
        const finalNumber = cleanNumber.length === 10 ? '57' + cleanNumber : cleanNumber;
        let mediatype = 'image';
        if (base64.includes('application/pdf') || fileName.endsWith('.pdf')) mediatype = 'document';
        else if (base64.includes('audio/')) mediatype = 'audio';
        // Quitar prefijo data URL si existe
        const rawBase64 = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
        const url = `${EVO_URL}/message/sendMedia/${instanceName}`;
        const payload = { number: finalNumber, mediatype, caption: caption || fileName, media: rawBase64, fileName, delay: 1200 };
        const response = await axios.post(url, payload, { headers: this.getHeaders() });
        return response.data;
    }

    /**
     * Envía mensaje de texto
     */
    async sendMessage(userId: string, number: string, text: string) {
        const sessionName = `user_${userId}`;
        const cleanNumber = number.replace(/\D/g, '');
        const finalNumber = cleanNumber.length === 10 ? '57' + cleanNumber : cleanNumber;

        try {
            const url = `${EVO_URL}/message/sendText/${sessionName}`;
            // Evolution API v2: campo "text" directo
            const payload = { number: finalNumber, text, delay: 1200 };
            const response = await axios.post(url, payload, { headers: this.getHeaders() });
            await this.logMessage(userId, finalNumber, text, 'SENT', 'OUTBOUND', response.data?.key?.id);
            return response.data;
        } catch (error: any) {
            console.error(`[EVO-FAIL] ${sessionName} -> ${finalNumber}:`, error.message);
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
        const finalNumber = cleanNumber.length === 10 ? '57' + cleanNumber : cleanNumber;

        let mediatype = 'image';
        if (base64.includes('application/pdf')) mediatype = 'document';
        else if (base64.includes('audio/')) mediatype = 'audio';
        else if (base64.includes('video/')) mediatype = 'video';

        try {
            // Evolution v2 requiere base64 puro (sin el prefijo data:...;base64,)
            const rawBase64 = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
            const url = `${EVO_URL}/message/sendMedia/${sessionName}`;
            const payload = { number: finalNumber, mediatype, caption: caption || fileName, media: rawBase64, fileName, delay: 1200 };
            const response = await axios.post(url, payload, { headers: this.getHeaders() });
            await this.logMessage(userId, finalNumber, `[MEDIA: ${fileName}] ${caption || ''}`, 'SENT', 'OUTBOUND', response.data?.key?.id);
            return response.data;
        } catch (error: any) {
            console.error(`[EVO-MEDIA-FAIL] ${sessionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Contactos — Evolution v2 no tiene endpoint de sync; usa logs locales
     */
    async syncContacts(_userId: string) {
        return { success: true, message: 'Sincronización completada (usando datos locales)' };
    }

    async getContacts(userId: string) {
        try {
            const sessionName = `user_${userId}`;
            const res = await axios.get(`${EVO_URL}/contact/findContacts/${sessionName}`, {
                headers: this.getHeaders(), timeout: 8000
            });
            return Array.isArray(res.data) ? res.data : (res.data?.records || []);
        } catch {
            return [];
        }
    }

    /**
     * Obtiene los chats activos combinando Evolution + logs locales
     */
    async getChats(userId: string) {
        const sessionName = `user_${userId}`;
        try {
            const [chatsRes, contactsRes, logsRes] = await Promise.all([
                axios.get(`${EVO_URL}/chat/findChats/${sessionName}`, {
                    headers: this.getHeaders(), timeout: 8000
                }).catch(() => ({ data: [] })),
                axios.get(`${EVO_URL}/contact/findContacts/${sessionName}`, {
                    headers: this.getHeaders(), timeout: 8000
                }).catch(() => ({ data: [] })),
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

            const contactMap = new Map<string, string>();
            contacts.forEach((c: any) => {
                const jid = c.id || c.remoteJid || c.jid || '';
                const name = c.name || c.fullName || c.verifiedName || c.pushName || c.pushname || '';
                if (jid && name) contactMap.set(jid, name);
            });

            const chatMap = new Map<string, any>();

            apiChats.forEach((chat: any) => {
                const jid = chat.id || chat.remoteJid || '';
                if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us')) {
                    const phone = jid.split('@')[0];
                    if (phone.length > 5 && phone !== '0') {
                        const isGroup = jid.endsWith('@g.us');
                        const resolvedName = contactMap.get(jid)
                            || (isGroup ? chat.subject : null)
                            || chat.name || chat.pushName || chat.pushname || phone;
                        chatMap.set(jid, {
                            id: jid, name: resolvedName,
                            lastMessage: chat.lastMessage,
                            timestamp: chat.lastMessage?.messageTimestamp || 0,
                            isGroup,
                        });
                    }
                }
            });

            logs.forEach((row: any) => {
                const phone = row.phone_number;
                const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
                if (!chatMap.has(jid)) {
                    chatMap.set(jid, {
                        id: jid,
                        name: contactMap.get(jid) || phone,
                        lastMessage: { message: { conversation: 'Enviado desde M7' } },
                        timestamp: Math.floor(new Date(row.last_date).getTime() / 1000),
                        isGroup: false,
                    });
                }
            });

            return Array.from(chatMap.values()).sort((a, b) => b.timestamp - a.timestamp);
        } catch (error: any) {
            console.error(`[EVO-CHATS-ERR] ${sessionName}:`, error.message);
            return [];
        }
    }

    /**
     * Obtiene mensajes de un chat combinando Evolution + logs
     */
    async getMessages(userId: string, remoteJid: string) {
        const sessionName = `user_${userId}`;
        try {
            const res = await axios.get(
                `${EVO_URL}/chat/findMessages/${sessionName}?remoteJid=${remoteJid}&count=50`,
                { headers: this.getHeaders(), timeout: 8000 }
            );
            const messages = Array.isArray(res.data) ? res.data : (res.data?.messages || res.data?.records || []);
            return messages;
        } catch {
            return [];
        }
    }

    /**
     * Cierra sesión
     */
    async logout(sessionName: string) {
        this.qrCache.delete(sessionName);
        try {
            await axios.delete(`${EVO_URL}/instance/delete/${sessionName}`, {
                headers: this.getHeaders(), timeout: 8000
            });
            return { success: true };
        } catch (e: any) {
            try {
                await axios.delete(`${EVO_URL}/instance/logout/${sessionName}`, {
                    headers: this.getHeaders(), timeout: 8000
                });
                return { success: true };
            } catch (err) {
                return { success: false, error: e.message };
            }
        }
    }

    private async logMessage(
        userId: string, phone: string, body: string,
        status: string, direction: string,
        externalId: string | null = null, error: string | null = null
    ) {
        try {
            await pool.query(
                `INSERT INTO whatsapp_logs (user_id, phone_number, message_body, status, direction, external_message_id, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userId, phone, body, status, direction, externalId, error]
            );
        } catch (dbError) {
            console.error('[EVO-LOG-ERR]', dbError);
        }
    }
}

export const evolutionService = new EvolutionService();
