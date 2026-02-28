import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;

import fs from 'fs';
import path from 'path';

const PRIVATE_KEY_PATH = path.join(process.cwd(), 'backend', 'config', 'keys', 'private.pem');
const PUBLIC_KEY_PATH = path.join(process.cwd(), 'backend', 'config', 'keys', 'public.pem');

const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

export interface TokenPayload {
    id: string;
    email: string;
    role_id: string;
    permissions?: any[];
}

export const signAccessToken = (payload: TokenPayload): string => {
    return sign(payload, PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '2h' // Expiración de 2 horas para el token de acceso
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
