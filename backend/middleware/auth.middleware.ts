import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util.js';

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error(`[AUTH-FAILURE] No se recibió cabecera Authorization para: ${req.method} ${req.url}`);
        console.log('[DEBUG-HEADERS]:', JSON.stringify(req.headers, null, 2));
        return res.status(401).json({ success: false, error: 'Acceso denegado. No se proporcionó un token.' });
    }

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error: any) {
        console.error(`[AUTH-FAILURE] Token inválido para: ${req.method} ${req.url}. Error: ${error.message}`);
        // Ofuscar el token para los logs de depuración
        const partialToken = token.substring(0, 10) + '...';
        console.log(`[DEBUG-TOKEN]: Received token: ${partialToken}`);
        return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
    }
};

const ID_MAP: Record<string, string> = {
    'ARTICULOS': 'PAG-01',
    'CLIENTES': 'PAG-03',
    'VEHICULOS': 'PAG-14',
    'CONDUCTORES': 'PAG-14',
    'USUARIOS': 'PAG-21',
    'ROLES': 'PAG-22',
    'ASIGNACIONES': 'PAG-12',
    'DOCUMENTOS_L': 'PAG-16',
    'RUTAS': 'PAG-15',
    'DASHBOARD': 'PAG-25',
    'NOTIFICACIONES': 'PAG-07',
    'GRUPO_INTER': 'PAG-31'
};

export const requirePermission = (moduleName: string, action: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const user = req.user;
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        }

        // El rol de ADMIN (ROL-01) tiene acceso total por defecto
        if (user.roleId === 'ROL-01' || user.role_id === 'ROL-01' || user.email === 'admin@millasiete.com') {
            return next();
        }

        const pageId = ID_MAP[moduleName];

        const hasPermission = user.permissions?.some((p: any) => 
            (p.module === moduleName || (pageId && p.module === pageId)) && 
            p.actions.includes(action)
        );

        if (!hasPermission) {
            console.warn(`[AUTH-403] Usuario ${user.email} intentó acceder a ${moduleName}:${action} sin permiso. ID esperado: ${pageId}`);
            return res.status(403).json({ 
                success: false, 
                error: `Permiso insuficiente. Se requiere ${moduleName}:${action}` 
            });
        }

        next();
    };
};

