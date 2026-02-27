
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
            statusId: row.status_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            createdBy: row.created_by,
            updatedBy: row.updated_by
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
  const email = req.query.email as string;
  
  // SOLUCIÓN MEJORADA: Verificación por ID    // Lógica de Super Admin: admin (legacy), USR-01 (M7 Local/Prod) o email específico
    const uId = String(userId);
    const isSuperAdmin = uId.toLowerCase() === 'admin' || 
                        uId.toUpperCase() === 'USR-01' || 
                        email?.toLowerCase() === 'admin@millasiete.com';

  // Si necesitamos la lista completa de páginas para el admin, lo ideal sería consultarla de la DB
  // pero mantendremos la lista hardcoded por ahora solo para el fallback de admin real.
  const pages = [
    'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
    'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22',
    'PAG-23', 'PAG-24', 'PAG-25', 'PAG-26', 'PAG-27', 'PAG-28', 'PAG-29'
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

      // Retornar el objeto plano para que el Editor de Permisos (MasterModule) pueda 
      // mapear los checkboxes correctamente (formData['page_X_view']).
      // La transformación a array se hace en auth.controller.ts para el login.
      return res.json(flatPerms);

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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. DELETE EXISTING PERMISSIONS FOR USER (Clean Slate Strategy)
    // This ensures no old keys remain if they were removed from the frontend payload.
    await client.query('DELETE FROM user_permissions WHERE user_id = $1', [p.userId]);

    // 2. INSERT NEW PERMISSIONS
    const newId = p.id || `PERM-USER-${p.userId}`;
    await client.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [newId, p.userId, JSON.stringify(p), p.statusId, p.createdBy || p.updatedBy || 'System']);

    await client.query('COMMIT');
    
    console.log(`[M7-PERMISSIONS] Permissions reset and updated for User: ${p.userId}`);
    res.json({ success: true, message: 'Permisos de usuario actualizados correctamente (Reset Completo)' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-PERMISSIONS] Error saving:', err);
    res.status(500).json({ error: "Error al guardar permisos de usuario" });
  } finally {
    client.release();
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
