
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUserPermissions = async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  // SOLUCIÓN REAL: Forzar permisos completos para el ADMIN
  const isSuperAdmin = userId === 'USR-01' || userId === 'admin' || userId === 'admin@millasiete.com';

  const pages = [
    'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
    'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22'
  ];

  if (isSuperAdmin) {
    console.log(`[M7-PERMISSIONS] FORZANDO array de permisos para Admin: ${userId}`);
    const permissionsArray = pages.map(pageId => ({
      module: pageId,
      actions: ['view', 'create', 'edit', 'delete', 'active']
    }));
    
    return res.json(permissionsArray);
  }

  try {
    const result = await pool.query('SELECT * FROM user_permissions WHERE user_id = $1', [userId]);
    
    if (result.rows.length > 0) {
      let perms = result.rows[0].permissions;
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
      }

      // Transformar objeto plano a array si es necesario
      if (!Array.isArray(perms)) {
          const transformed: any[] = [];
          pages.forEach(pageId => {
              const actions: string[] = [];
              if (perms[`page_${pageId}_view`]) actions.push('view');
              if (perms[`page_${pageId}_create`]) actions.push('create');
              if (perms[`page_${pageId}_edit`]) actions.push('edit');
              if (perms[`page_${pageId}_delete`]) actions.push('delete');
              if (perms[`page_${pageId}_active`]) actions.push('active');
              
              if (actions.length > 0) {
                  transformed.push({ module: pageId, actions });
              }
          });
          return res.json(transformed);
      }

      return res.json(perms);
    }
    
    res.json([]); // Devolver array vacío en lugar de null para evitar errores de .find
  } catch (err: any) {
    console.warn('[M7-USER-PERMISSIONS] Error en DB, devolviendo array vacío');
    res.json([]);
  }
};

export const saveUserPermission = async (req: Request, res: Response) => {
  const p = req.body;
  try {
    await pool.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
      user_id = $2, permissions = $3, status_id = $4
    `, [p.id, p.userId, JSON.stringify(p), p.statusId]);
    res.json({ success: true, message: 'Permisos de usuario guardados' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar permisos de usuario" });
  }
};
