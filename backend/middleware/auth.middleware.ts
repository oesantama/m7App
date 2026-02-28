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

export const requirePermission = (module: string, action: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const user = req.user;
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        }

        // El rol de ADMIN (ROL-01) tiene acceso total por defecto
        if (user.roleId === 'ROL-01' || user.role_id === 'ROL-01' || user.email === 'admin@millasiete.com') {
            return next();
        }

        // Verificar permisos específicos en el payload del token o volver a consultar DB si es necesario
        // Por ahora, asumimos que los permisos vienen en el token para evitar latencia de DB en cada request
        const hasPermission = user.permissions?.some((p: any) => 
            p.module === module && p.actions.includes(action)
        );

        if (!hasPermission) {
            return res.status(403).json({ 
                success: false, 
                error: `Permiso insuficiente. Se requiere ${module}:${action}` 
            });
        }

        next();
    };
};
