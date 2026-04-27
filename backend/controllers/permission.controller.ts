
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getRolePermissions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT r.id as role_id, r.name as role_name, rp.id, rp.permissions, rp.status_id, rp.created_at, rp.updated_at, rp.created_by, rp.updated_by
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      ORDER BY r.name ASC
    `);
    
    // Aplanar los resultados para que el frontend reciba un objeto lineal
    const rows = result.rows.map(row => {
        let perms = row.permissions || {};
        if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
        }
        return {
            ...perms,
            id: row.id,
            roleId: row.role_id,
            roleName: row.role_name,
            statusId: row.status_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            createdBy: row.created_by,
            updatedBy: row.updated_by
        };
    });
    
    res.json(rows);
  } catch (err: any) {
    console.warn('[M7-PERMISSIONS] Error en DB o modo Offline, usando mock');
    
    // Generar permisos completos para SUPERUSUARIO (ROL-01)
    const pages = [
        'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
        'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21', 'PAG-22',
        'PAG-23', 'PAG-24', 'PAG-25', 'PAG-26', 'PAG-27', 'PAG-28', 'PAG-29'
    ];
    
    const permissions: any = {
        id: 'PERM-ROL-01',
        roleId: 'ROL-01',
        roleName: 'SUPERUSUARIO',
        statusId: 'EST-01'
    };
    
    // Asignar todos los permisos
    pages.forEach(pageId => {
        permissions[`page_${pageId}_view`] = true;
        permissions[`page_${pageId}_create`] = true;
        permissions[`page_${pageId}_edit`] = true;
        permissions[`page_${pageId}_delete`] = true;
        permissions[`page_${pageId}_active`] = true;
    });
    
    res.json([permissions]); 
  }
};

export const saveRolePermission = async (req: Request, res: Response) => {
  const p = req.body;
  try {
    await pool.query(`
      INSERT INTO role_permissions (id, role_id, permissions, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      role_id = $2, permissions = $3, status_id = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
    `, [p.id, p.roleId, JSON.stringify(p), p.statusId, p.createdBy || p.updatedBy || 'System']);
    res.json({ success: true, message: 'Permisos guardados' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar permisos" });
  }
};

export const deleteRolePermission = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  
  try {
    // Audit before delete
    const record = await pool.query('SELECT * FROM role_permissions WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['role_permissions', id, record.rows[0], deletedBy || 'Unknown']
      );
    }

    const result = await pool.query('DELETE FROM role_permissions WHERE id = $1 RETURNING id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Permiso de rol no encontrado" });
    }

    res.json({ success: true, message: 'Permiso de rol eliminado y auditado' });
  } catch (err: any) {
    console.error(`[M7-ROLE-PERMISSIONS] Error deleting:`, err);
    res.status(500).json({ error: "Error al eliminar permiso de rol" });
  }
};
