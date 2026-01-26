
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUserPermissions = async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM user_permissions WHERE user_id = $1', [userId]);
    
    if (result.rows.length > 0) {
      console.log(`[M7-PERMISSIONS] Permisos encontrados en DB para ${userId}`);
      res.json(result.rows[0]);
      return;
    }
    
    // Si no hay permisos en DB y es admin, damos permisos mock
    if (userId === 'U-001' || userId === 'admin') {
      console.log(`[M7-PERMISSIONS] Usando Mock para Admin: ${userId}`);
      const pages = [
        'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
        'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21'
      ];
      
      const permissions: any = {
        id: `PERM-USER-${userId}`,
        userId: userId,
        statusId: 'EST-01'
      };
      
      pages.forEach(pageId => {
        permissions[`page_${pageId}_view`] = true;
        permissions[`page_${pageId}_create`] = true;
        permissions[`page_${pageId}_edit`] = true;
        permissions[`page_${pageId}_delete`] = true;
        permissions[`page_${pageId}_active`] = true;
      });
      
      res.json(permissions);
    } else {
      console.log(`[M7-PERMISSIONS] Sin permisos para ${userId}`);
      res.json(null);
    }
  } catch (err: any) {
    console.warn('[M7-USER-PERMISSIONS] Offline Mode activo');
    
    // Mock: Permisos completos para usuario demo
    if (userId === 'U-001') {
      const pages = [
        'PAG-01', 'PAG-02', 'PAG-03', 'PAG-04', 'PAG-05', 'PAG-06', 'PAG-07', 'PAG-08', 'PAG-09', 'PAG-10',
        'PAG-11', 'PAG-12', 'PAG-13', 'PAG-14', 'PAG-15', 'PAG-16', 'PAG-17', 'PAG-18', 'PAG-19', 'PAG-20', 'PAG-21'
      ];
      
      const permissions: any = {
        id: `PERM-USER-${userId}`,
        userId: userId,
        statusId: 'EST-01'
      };
      
      // Asignar todos los permisos para el usuario admin
      pages.forEach(pageId => {
        permissions[`page_${pageId}_view`] = true;
        permissions[`page_${pageId}_create`] = true;
        permissions[`page_${pageId}_edit`] = true;
        permissions[`page_${pageId}_delete`] = true;
        permissions[`page_${pageId}_active`] = true;
      });
      
      res.json(permissions);
    } else {
      // Usuarios sin permisos específicos
      res.json(null);
    }
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
