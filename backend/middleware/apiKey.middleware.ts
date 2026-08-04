import { Request, Response, NextFunction } from 'express';

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['x-api-key'];
    const expected = process.env.INVENTARIO_SCRIPT_KEY;

    if (!expected) {
        console.error('[API-KEY] INVENTARIO_SCRIPT_KEY no está configurada en el entorno.');
        return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta.' });
    }

    if (key !== expected) {
        console.error(`[API-KEY-FAILURE] Intento de acceso con API key inválida a ${req.method} ${req.url}`);
        return res.status(401).json({ success: false, error: 'API key inválida.' });
    }

    next();
};
