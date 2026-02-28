import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import { signAccessToken } from '../utils/jwt.util.js';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const identifier = email?.trim().toLowerCase();
    
    const result = await pool.query(
      `SELECT id, email, password, name, role_id, client_ids, two_factor_enabled, two_factor_secret 
       FROM users 
       WHERE (LOWER(TRIM(email)) = $1 OR LOWER(TRIM(document_number)) = $1 OR LOWER(TRIM(phone)) = $1)`,
      [identifier]
    );

    const user = result.rows[0];
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Usuario no registrado o identificador incorrecto' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // FETCH PERMISSIONS
    const permResult = await pool.query('SELECT permissions FROM user_permissions WHERE user_id = $1', [user.id]);
    let permissions: any[] = [];
    
    if (permResult.rows.length > 0) {
        const rawPerms = permResult.rows[0].permissions || {};
        const permMap = new Map<string, Set<string>>();

        Object.keys(rawPerms).forEach(key => {
            if (rawPerms[key] === true) {
                const parts = key.toLowerCase().split('_');
                if (parts.length >= 3 && parts[0] === 'page') {
                     const action = parts.pop();
                     const pageId = parts.slice(1).join('_').toUpperCase();
                     
                     if (pageId && action) {
                         if (!permMap.has(pageId)) permMap.set(pageId, new Set());
                         permMap.get(pageId)?.add(action);
                     }
                }
            }
        });

        permissions = Array.from(permMap.entries()).map(([module, actions]) => ({
            module,
            actions: Array.from(actions)
        }));
    }

    if (user.two_factor_enabled) {
        return res.json({ 
            success: true, 
            require2FA: true, 
            userId: user.id 
        });
    }

    // GENERAR TOKEN JWT (Seguridad Arquitectónica)
    const userData = { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role_id: user.role_id,
        permissions: permissions 
    };

    const accessToken = signAccessToken(userData);

    res.json({ 
        success: true, 
        token: accessToken,
        user: userData
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = (req: Request, res: Response) => {
  res.json({ success: true, message: 'Sesión finalizada' });
};
