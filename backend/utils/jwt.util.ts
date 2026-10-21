import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;

import fs from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

const KEYS_DIR = path.join(process.cwd(), 'backend', 'config', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

function getOrGenerateKeys(): { privateKey: string; publicKey: string } {
    // 1. Prioridad: Variables de entorno (recomendado para Coolify / Docker secrets)
    if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) {
        return {
            privateKey: process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
            publicKey: process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n')
        };
    }

    // 2. Archivos en disco si existen
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        try {
            const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
            if (privateKey && publicKey) {
                return { privateKey, publicKey };
            }
        } catch (e: any) {
            console.warn('[JWT-KEY] Error al leer llaves en disco:', e.message);
        }
    }

    // 3. Fallback seguro: Autogeneración en frío de par RSA 2048-bit para evitar crash
    console.warn('[JWT-KEY] Llaves RSA no encontradas. Generando par criptográfico seguro de 2048 bits...');
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
