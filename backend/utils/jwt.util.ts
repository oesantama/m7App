import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;

import fs from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

const KEYS_DIR = path.join(process.cwd(), 'backend', 'config', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

function parsePemKey(raw?: string): string | null {
    if (!raw) return null;
    let key = raw.trim();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
    key = key.replace(/\\n/g, '\n');

    // Soporte para llaves PEM codificadas en Base64
    if (!key.includes('BEGIN') && !key.includes('END') && key.length > 50) {
        try {
            const decoded = Buffer.from(key, 'base64').toString('utf8');
            if (decoded.includes('BEGIN')) key = decoded;
        } catch {}
    }

    if (key.includes('BEGIN') && (key.includes('KEY') || key.includes('CERTIFICATE'))) {
        return key;
    }
    return null;
}

function getOrGenerateKeys(): { privateKey: string; publicKey: string } {
    // 1. Prioridad: Variables de entorno válidas (formato PEM)
    const envPriv = parsePemKey(process.env.JWT_PRIVATE_KEY);
    const envPub = parsePemKey(process.env.JWT_PUBLIC_KEY);
    if (envPriv && envPub) {
        console.log('[JWT-KEY] Utilizando llaves RSA configuradas en variables de entorno.');
        return { privateKey: envPriv, publicKey: envPub };
    }

    // 2. Archivos en disco si existen y son válidos
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        try {
            const diskPriv = parsePemKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));
            const diskPub = parsePemKey(fs.readFileSync(PUBLIC_KEY_PATH, 'utf8'));
            if (diskPriv && diskPub) {
                console.log('[JWT-KEY] Utilizando llaves RSA persistidas en disco.');
                return { privateKey: diskPriv, publicKey: diskPub };
            }
        } catch (e: any) {
            console.warn('[JWT-KEY] Error al leer llaves en disco:', e.message);
        }
    }

    // 3. Fallback seguro: Autogeneración en frío de par RSA 2048-bit para evitar crash
    console.warn('[JWT-KEY] Llaves RSA no encontradas o no válidas en entorno. Generando par criptográfico seguro de 2048 bits...');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    try {
        if (!fs.existsSync(KEYS_DIR)) {
            fs.mkdirSync(KEYS_DIR, { recursive: true });
        }
        fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
        fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
        console.log('[JWT-KEY] Par de llaves RSA 2048 generado y persistido en backend/config/keys.');
    } catch (err: any) {
        console.warn('[JWT-KEY] No se pudieron persistir llaves a disco, usando llaves en memoria:', err.message);
    }

    return { privateKey, publicKey };
}

const { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY } = getOrGenerateKeys();


export interface TokenPayload {
    id: string;
    email: string;
    role_id: string;
    permissions?: any[];
}

export const signAccessToken = (payload: any): string => {
    // Aseguramos que el payload tenga tanto role_id como roleId para compatibilidad total
    const enrichedPayload = {
        ...payload,
        roleId: payload.roleId || payload.role_id,
        role_id: payload.role_id || payload.roleId
    };
    return sign(enrichedPayload, PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '30d' // Reducido a 30d por seguridad (tokens robados quedan válidos menos tiempo)
    });
};

export const signRefreshToken = (payload: { id: string }): string => {
    return sign(payload, PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '7d' // Expiración de 7 días para el refresh token
    });
};

export const verifyToken = (token: string): TokenPayload => {
    return verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) as TokenPayload;
};
