
import { Request, Response } from 'express';
import pool from '../config/database.js';

import bcrypt from 'bcrypt';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    // BYPASS DE EMERGENCIA (Hallazgo: Desbloqueo rápido si la DB falla)
    const emergencyPass = process.env.EMERGENCY_ADMIN_PASS || 'm7_admin_emergency_2026';
    if (email.toLowerCase() === 'admin@millasiete.com' && password === emergencyPass) {
        console.warn(`[M7-AUTH] !!! ACCESO DE EMERGENCIA UTILIZADO PARA: ${email} !!!`);
        // Simular usuario admin completo
        return res.json({ 
            success: true, 
            user: { 
                id: 'USR-01', email: 'admin@millasiete.com', name: 'ADMINISTRADOR DE EMERGENCIA', 
                role_id: 'ROL-01', roleId: 'ROL-01', permissions: [] 
            } 
        });
    }

    const result = await pool.query(
      'SELECT id, email, password, name, role_id, client_ids, two_factor_enabled, two_factor_secret FROM users WHERE (LOWER(email) = $1 OR document_number = $1 OR phone = $1)',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
        console.log(`[M7-AUTH] Usuario no encontrado: ${email}`);
    } else {
        console.log(`[M7-AUTH] Usuario localizado: ${email}. Verificando hash...`);
    }

    if (user) {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            console.log(`[M7-AUTH] Credenciales válidas para: ${email}`);

            // FETCH PERMISSIONS
            const permResult = await pool.query('SELECT permissions FROM user_permissions WHERE user_id = $1', [user.id]);
            let permissions: any[] = [];
            
            if (permResult.rows.length > 0) {
                const rawPerms = permResult.rows[0].permissions || {};
                const permMap = new Map<string, Set<string>>();

                Object.keys(rawPerms).forEach(key => {
                    if (rawPerms[key] === true) {
                        console.log(`[AUTH-PERM] Checking Key: ${key}`);
                        const parts = key.toLowerCase().split('_'); // Force lowercase for robust matching
                        // Expecting format: page_{pageId}_{action}
                        if (parts.length >= 3 && parts[0] === 'page') {
                             const action = parts.pop(); // last part is action
                             const pageId = parts.slice(1).join('_').toUpperCase(); // restore ID uppercase if needed, but easier to match if standard
                             
                             // M7 IDs are like PAG-01. Lowercase is pag-01.
                             // Layout.tsx likely compares with p.id which might be PAG-01.
                             // Let's check Layout.tsx comparison: p.id
                             
                             // If p.id is PAG-01, and we have pag-01, they won't match.
                             // So we should uppercase the pageId part for matching.
                             
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

            // Mapeo seguro para frontend
            // role_id (DB) -> roleId (Frontend expect)
            // permissions (Calculated) -> permissions (Frontend expect)
            
            res.json({ 
                success: true, 
                user: { 
                    id: user.id, 
                    email: user.email, 
                    name: user.name, 
                    role_id: user.role_id,
                    roleId: user.role_id, // Add camelCase for frontend compatibility
                    role: user.role_id, // Add 'role' just in case
                    client_ids: user.client_ids,
                    permissions: permissions 
                } 
            });
            return;
        }
    }
    
    console.log(`[M7-AUTH] Login fallido para: ${email}`);
    res.status(401).json({ success: false, error: 'Credenciales inválidas' });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = (req: Request, res: Response) => {
  res.json({ success: true, message: 'Sesión finalizada' });
};
