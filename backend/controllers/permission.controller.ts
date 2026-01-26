
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getRolePermissions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM role_permissions ORDER BY role_id ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-PERMISSIONS] Offline Mode activo');
    
    // Generar permisos completos para SUPERUSUARIO (ROL-01)
    const pages = [
        'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
        'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21'
    ];
    
    const permissions: any = {
        id: 'PERM-ROL-01',
        roleId: 'ROL-01',
        statusId: 'EST-01'
    };
    
    // Asignar todos los permisos (view, create, edit, delete, active) para todas las páginas
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
      INSERT INTO role_permissions (id, role_id, permissions, status_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
      role_id = $2, permissions = $3, status_id = $4
    `, [p.id, p.roleId, JSON.stringify(p), p.statusId]);
    res.json({ success: true, message: 'Permisos guardados' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar permisos" });
  }
};
