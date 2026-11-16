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

// ── Permisos compactos dentro del JWT ─────────────────────────────────────────
// Un SuperAdmin tiene ~600 permisos; como {"module","actions"} el token pasaba de 8 KB:
// nginx lo rechazaba (400), no cabía en la cookie de sesión (máx. 4 KB) y pesaba en cada
// petición. En el token viajan agrupados "vced|PAG-01,PAG-02" (claim `pc`) y verifyToken los expande al
// formato de siempre, así que el resto del backend no cambia. Acciones desconocidas van
// completas entre paréntesis: "v(nueva_accion)|PAG-09".
const ACCION_A_LETRA: Record<string, string> = {
    view: 'v', create: 'c', edit: 'e', delete: 'd', active: 't',
    approve: 'a', admin: 'm', execute: 'x', update: 'u',
};
const LETRA_A_ACCION: Record<string, string> = Object.fromEntries(
    Object.entries(ACCION_A_LETRA).map(([accion, letra]) => [letra, accion])
);

const codificarAcciones = (acciones: string[]): string =>
    (acciones || []).map(a => ACCION_A_LETRA[a] ?? `(${a})`).join('');

const decodificarAcciones = (codigo: string): string[] => {
    const actions: string[] = [];
    for (let k = 0; k < codigo.length; k++) {
        if (codigo[k] === '(') {
            const fin = codigo.indexOf(')', k);
            actions.push(codigo.slice(k + 1, fin));
            k = fin;
        } else if (LETRA_A_ACCION[codigo[k]]) {
            actions.push(LETRA_A_ACCION[codigo[k]]);
        }
    }
    return actions;
};

/** Agrupa los módulos que tienen el mismo juego de acciones: ["vcedt|PAG-01,PAG-02", "v|PAG-07"]. */
export const compactarPermisos = (permisos: any[]): string[] => {
    const grupos = new Map<string, string[]>();
    for (const p of permisos || []) {
        if (!p || !p.module) continue;
        const codigo = codificarAcciones(Array.isArray(p.actions) ? p.actions : []);
        if (!grupos.has(codigo)) grupos.set(codigo, []);
        grupos.get(codigo)!.push(String(p.module));
    }
    return Array.from(grupos.entries()).map(([codigo, modulos]) => `${codigo}|${modulos.join(',')}`);
};

export const expandirPermisos = (compactos: string[]): { module: string; actions: string[] }[] => {
    const salida: { module: string; actions: string[] }[] = [];
    for (const entrada of compactos || []) {
        const i = entrada.indexOf('|');
        const actions = decodificarAcciones(entrada.slice(0, i));
        for (const module of entrada.slice(i + 1).split(',')) {
            if (module) salida.push({ module, actions: [...actions] });
        }
    }
    return salida;
};

export const signAccessToken = (payload: any): string => {
    // Aseguramos que el payload tenga tanto role_id como roleId para compatibilidad total
    const { permissions, pc: _pcViejo, iat: _iat, exp: _exp, ...resto } = payload || {};
    const enrichedPayload: any = {
        ...resto,
        roleId: payload.roleId || payload.role_id,
        role_id: payload.role_id || payload.roleId
    };
    if (Array.isArray(permissions)) enrichedPayload.pc = compactarPermisos(permissions);
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
    const decoded: any = verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    // Tokens nuevos: permisos compactos en `pc`. Tokens anteriores: `permissions` completo (se aceptan igual).
    if (Array.isArray(decoded?.pc)) {
        decoded.permissions = expandirPermisos(decoded.pc);
        delete decoded.pc;
    }
    return decoded as TokenPayload;
};
