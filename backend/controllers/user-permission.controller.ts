
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getAllUserPermissions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT u.id as user_id, u.name as user_name, u.email as user_email, up.id, up.permissions, up.status_id, up.created_at, up.updated_at, up.created_by, up.updated_by
      FROM users u
      LEFT JOIN user_permissions up ON up.user_id = u.id
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

  const uId = String(userId);
  const isSuperAdmin = uId.toLowerCase() === 'admin' ||
                       uId.toUpperCase() === 'USR-01' ||
                       email?.toLowerCase() === 'admin@millasiete.com';

  if (isSuperAdmin) {
    try {
      // Obtener todas las páginas activas de la DB para el admin
      const pagesRes = await pool.query(`SELECT id FROM pages WHERE status_id = 'EST-01' ORDER BY id`);
      const pageIds = pagesRes.rows.map((r: any) => r.id);
      return res.json(pageIds.map((pageId: string) => ({
        module: pageId,
        actions: ['view', 'create', 'edit', 'delete', 'active']
      })));
    } catch {
      // Fallback si la tabla pages no está disponible
      const fallbackPages = Array.from({ length: 45 }, (_, i) => `PAG-${String(i + 1).padStart(2, '0')}`);
      return res.json(fallbackPages.map(pageId => ({
        module: pageId,
        actions: ['view', 'create', 'edit', 'delete', 'active']
      })));
    }
  }

  try {
    const result = await pool.query('SELECT * FROM user_permissions WHERE user_id = $1', [userId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      let perms = row.permissions || {};
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
      }

      // Devolver objeto plano con solo los campos necesarios para el editor de checkboxes.
      // La transformación a array para el login la hace auth.controller.ts.
      return res.json({
        ...perms,
        id: row.id,
        userId: row.user_id,
        statusId: row.status_id
      });
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

    // Extraer únicamente las claves page_* (evita guardar userId, id, statusId, etc. en el JSON)
    const cleanPerms: Record<string, boolean> = {};
    Object.keys(p).forEach(key => {
      if (key.startsWith('page_')) cleanPerms[key] = !!p[key];
    });
    // También aceptar el sub-objeto permissions si el frontend lo envió anidado
    if (p.permissions && typeof p.permissions === 'object') {
      Object.keys(p.permissions).forEach(key => {
        if (key.startsWith('page_')) cleanPerms[key] = !!p.permissions[key];
      });
    }

    const newId = p.id || `PUS-${p.userId}`;
    const userId = p.userId || p.user_id;
    const statusId = p.statusId || p.status_id || 'EST-01';
    const actor = p.updatedBy || p.createdBy || 'System';

    await client.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
    await client.query(`
      INSERT INTO user_permissions (id, user_id, permissions, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [newId, userId, JSON.stringify(cleanPerms), statusId, actor]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Permisos de usuario guardados correctamente' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-PERMISSIONS] Error saving:', err);
    res.status(500).json({ error: 'Error al guardar permisos de usuario' });
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
