import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util.js';

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error(`[AUTH-MISSING-TOKEN] ${req.method} ${req.url}`);
        return res.status(401).json({ success: false, error: 'Acceso denegado. No se proporcionó un token.' });
    }

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error: any) {
        console.error(`[AUTH-FAILURE] Token inválido para: ${req.method} ${req.url}. Error: ${error.message}`);
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
    'UBICACIONES': 'PAG-15', // GPS locations ligadas al módulo de rutas
    'DASHBOARD': 'PAG-25',
    'NOTIFICACIONES': 'PAG-07',
    'GRUPO_INTER': 'PAG-31',
    'WHATSAPP': 'PAG-07',
    'CAPACITACIONES': 'PAG-32',
    'PAG-33': 'PAG-33',
    'PAG-35': 'PAG-35',
    'CONCILIACION': 'PAG-36',
    'PAG-36': 'PAG-36',
    'PERSONAL_GH': 'PAG-43',
    'MISCELANEOS_GH': 'PAG-41',
    'ENTREGAS_SALIDAS_GH': 'PAG-52',
    'ASIGNACION_DEVOLUCION_GH': 'PAG-53',
    'CONSULTA_INVENTARIO_GH': 'PAG-54',
    'MASTER_INVENTARIO_GH': 'PAG-55',
};

// Módulos que usuarios con permiso RUTAS (PAG-15) pueden leer (solo view)
const RUTAS_READ_ALLOWED = new Set(['VEHICULOS', 'ASIGNACIONES', 'UBICACIONES', 'CONDUCTORES']);

export const requirePermission = (moduleName: string, action: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const user = req.user;
        
        if (!user) {
            console.error(`[AUTH-P-FAIL] No user in request for ${moduleName}:${action}`);
            return res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        }

        // El rol de ADMIN (ROL-01) tiene acceso total por defecto
        // Robustecido para comparar de forma segura y insensible a mayúsculas
        const isAdminRole = user.roleId === 'ROL-01' || user.role_id === 'ROL-01';
        const isAdminEmail = user.email?.toLowerCase() === 'admin@millasiete.com';

        if (isAdminRole || isAdminEmail) {
            return next();
        }

        const pageId = ID_MAP[moduleName];

        const hasPermission = user.permissions?.some((p: any) =>
            (p.module === moduleName || (pageId && p.module === pageId)) &&
            p.actions.includes(action)
        );

        if (hasPermission) return next();

        // Usuarios con permiso RUTAS pueden leer datos de vehículos, asignaciones y ubicaciones
        if (action === 'view' && RUTAS_READ_ALLOWED.has(moduleName)) {
            const rutasPageId = ID_MAP['RUTAS'];
            const hasRutas = user.permissions?.some((p: any) =>
                (p.module === 'RUTAS' || (rutasPageId && p.module === rutasPageId)) &&
                p.actions.includes('view')
            );
            if (hasRutas) return next();
        }

        console.warn(`[AUTH-403] Usuario ${user.email} intentó acceder a ${moduleName}:${action} sin permiso.`);
        return res.status(403).json({
            success: false,
            error: `Permiso insuficiente para ${moduleName}`
        });
    };
};

