
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getAllUserPermissions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT up.*, u.name as user_name, u.email as user_email
      FROM user_permissions up
      LEFT JOIN users u ON up.user_id = u.id
      ORDER BY u.name ASC
    `);
    
    const rows = result.rows.map(row => {
        let perms = row.permissions || {};
        if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
        }
        return {
            ...perms,
            id: row.id,
            userId: row.user_id,
            userName: row.user_name || row.user_email || row.user_id,
            statusId: row.status_id
        };
    });
    
    res.json(rows);
  } catch (err: any) {
    console.error('[M7-USER-PERMISSIONS] Error getting all:', err);
    res.json([]);
  }
};

export const getUserPermissions = async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  // SOLUCIÓN MEJORADA: Verificación por ID o por Rol de Super Admin
  const isSuperAdmin = 
    userId === 'USR-01' || 
    userId === 'admin' || 
    userId === 'admin@millasiete.com';

  const pages = [
    'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
    'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22'
  ];

  if (isSuperAdmin) {
    console.log(`[M7-PERMISSIONS] Forzando permisos completos para Admin: ${userId}`);
    const permissionsArray = pages.map(pageId => ({
      module: pageId,
      actions: ['view', 'create', 'edit', 'delete', 'active']
    }));
    
    return res.json(permissionsArray);
  }

  // Nota: En una fase posterior, esto debería consultar la tabla 'users' para verificar el role_id.

  try {
    const result = await pool.query('SELECT * FROM user_permissions WHERE user_id = $1', [userId]);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      let perms = row.permissions || {};
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
      }

      // Asegurar que campos del a tabla sobreescriban al JSON si hay conflicto
      const flatPerms = {
        ...perms,
        id: row.id,
        userId: row.user_id,
        statusId: row.status_id
      };

      // Transformar objeto plano a array si es necesario para el formato de consumo del Layout
      if (!Array.isArray(flatPerms)) {
          const transformed: any[] = [];
          pages.forEach(pageId => {
              const actions: string[] = [];
              if (flatPerms[`page_${pageId}_view`]) actions.push('view');
              if (flatPerms[`page_${pageId}_create`]) actions.push('create');
              if (flatPerms[`page_${pageId}_edit`]) actions.push('edit');
              if (flatPerms[`page_${pageId}_delete`] ) actions.push('delete');
              if (flatPerms[`page_${pageId}_active`]) actions.push('active');
              
              if (actions.length > 0) {
                  transformed.push({ module: pageId, actions });
              }
          });
          return res.json(transformed);
      }

      return res.json(flatPerms);
    }
    
    res.json([]); 
  } catch (err: any) {
    console.warn('[M7-USER-PERMISSIONS] Error en DB, devolviendo array vacío');
    res.json([]);
  }
};

export const saveUserPermission = async (req: Request, res: Response) => {
  const p = req.body;
  try {
    await pool.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      user_id = $2, permissions = $3, status_id = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
    `, [p.id, p.userId, JSON.stringify(p), p.statusId, p.createdBy || p.updatedBy || 'System']);
    res.json({ success: true, message: 'Permisos de usuario guardados' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar permisos de usuario" });
  }
};

export const deleteUserPermission = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  
  try {
    // Audit before delete
    const record = await pool.query('SELECT * FROM user_permissions WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['user_permissions', id, record.rows[0], deletedBy || 'Unknown']
      );
    }

    const result = await pool.query('DELETE FROM user_permissions WHERE id = $1 RETURNING id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Permiso de usuario no encontrado" });
    }

    res.json({ success: true, message: 'Permiso de usuario eliminado y auditado' });
  } catch (err: any) {
    console.error(`[M7-USER-PERMISSIONS] Error deleting:`, err);
    res.status(500).json({ error: "Error al eliminar permiso de usuario" });
  }
};
