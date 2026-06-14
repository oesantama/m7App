import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.util.js';
import pool from '../config/database.js';

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
    'NOTICIAS': 'PAG-63',
    'MAESTRAS_DOGAMA': 'PAG-64',
    'CITAS_DESPACHO_CARGA': 'PAG-65',
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

export const requirePermission = (moduleName: string | string[], action: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        const user = req.user;
        
        if (!user) {
            console.error(`[AUTH-P-FAIL] No user in request for ${moduleName}:${action}`);
            return res.status(401).json({ success: false, error: 'Usuario no autenticado.' });
        }

        // El rol de ADMIN (ROL-01) tiene acceso total por defecto
        const isAdminRole = user.roleId === 'ROL-01' || user.role_id === 'ROL-01';
        const isAdminEmail = user.email?.toLowerCase() === 'directorti@millasiete.com';

        if (isAdminRole || isAdminEmail) {
            return next();
        }

        const modulesToCheck = Array.isArray(moduleName) ? moduleName : [moduleName];

        const hasPermission = modulesToCheck.some(modName => {
            const pageId = ID_MAP[modName];
            return user.permissions?.some((p: any) =>
                (p.module === modName || (pageId && p.module === pageId)) &&
                p.actions.includes(action)
            );
        });

        if (hasPermission) return next();

        // Usuarios con permiso RUTAS pueden leer datos de vehículos, asignaciones y ubicaciones
        if (action === 'view') {
            const allowedByRutas = modulesToCheck.some(modName => RUTAS_READ_ALLOWED.has(modName));
            if (allowedByRutas) {
                const rutasPageId = ID_MAP['RUTAS'];
                const hasRutas = user.permissions?.some((p: any) =>
                    (p.module === 'RUTAS' || (rutasPageId && p.module === rutasPageId)) &&
                    p.actions.includes('view')
                );
                if (hasRutas) return next();
            }
        }

        // Para módulo CAPACITACIONES: verificar si el usuario está registrado como especialista activo
        const isCap = modulesToCheck.some(m => m === 'CAPACITACIONES' || ID_MAP[m] === 'PAG-32');
        if (isCap) {
            const userId = user.id;
            if (userId) {
                try {
                    const r = await pool.query(
                        `SELECT 1 FROM cap_especialistas WHERE user_id = $1 AND activo = true LIMIT 1`,
                        [userId]
                    );
                    if (r.rows.length > 0) return next();
                } catch { /* ignorar error DB, continuar con 403 */ }
            }
        }

        console.warn(`[AUTH-403] Usuario ${user.email} intentó acceder a ${moduleName}:${action} sin permiso.`);
        return res.status(403).json({
            success: false,
            error: `Permiso insuficiente para ${Array.isArray(moduleName) ? moduleName.join(', ') : moduleName}`
        });
    };
};

