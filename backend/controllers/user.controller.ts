
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUsers = async (req: Request, res: Response) => {
  try {
    // Reparación de esquema bajo demanda M7
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS client_ids TEXT[] DEFAULT \'{}\';');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS document_type TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS document_number TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by TEXT;');

    const result = await pool.query(`
      SELECT 
        u.id, u.email, u.name, 
        u.role_id AS "roleId", 
        u.status_id AS "statusId",
        u.two_factor_enabled AS "twoFactorEnabled",
        u.phone, u.avatar,
        u.document_type AS "documentType",
        u.document_number AS "documentNumber",
        COALESCE(ds.aprobada::boolean, false) AS "isApproved",
        (ds.firma IS NOT NULL) AS "hasSignature",
        u.client_ids AS "clientIds",
        u.created_at AS "createdAt", u.updated_at AS "updatedAt", 
        u.created_by AS "createdBy", u.updated_by AS "updatedBy"
      FROM users u
      LEFT JOIN digital_signatures ds ON u.id = ds.idusuario
      ORDER BY u.name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-USERS] Error fetching users:', err);
    res.status(500).json({ error: "Error al obtener usuarios: " + err.message });
  }
};

import bcrypt from 'bcryptjs';

export const saveUser = async (req: Request, res: Response) => {
  const u = req.body;
  try {
    const check = await pool.query('SELECT password FROM users WHERE id = $1', [u.id]);
    
    if (check.rows.length > 0) {
        // UPDATE
        let newPass = check.rows[0].password;
        
        if (u.password && u.password.trim() !== '') {
             const salt = await bcrypt.genSalt(10);
             newPass = await bcrypt.hash(u.password, salt);
        }

        const clientIds = (Array.isArray(u.clientIds) && u.clientIds.length > 0) 
                           ? u.clientIds 
                           : (u.clientId ? [u.clientId] : []);

        await pool.query(`
          UPDATE users 
          SET email = $2, name = $3, password = $4, role_id = $5, client_ids = $6, status_id = $7,
              phone = $8, avatar = $9, document_type = $10, document_number = $11, two_factor_enabled = $12,
              updated_by = $13, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [u.id, u.email, u.name, newPass, u.roleId, clientIds, u.statusId, u.phone, u.avatar, u.documentType, u.documentNumber, u.twoFactorEnabled, u.updatedBy || 'System']);
        
        // M7 FIX: Sincronización automática de permisos en UPDATE
        const rolePermsResult = await pool.query('SELECT permissions FROM role_permissions WHERE role_id = $1', [u.roleId]);
        const initialPermissions = rolePermsResult.rows.length > 0 ? rolePermsResult.rows[0].permissions : '{}';

        await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [u.id]);
        await pool.query(`
          INSERT INTO user_permissions (id, user_id, permissions, status_id)
          VALUES ($1, $2, $3, $4)
        `, [`PUS-${u.id}`, u.id, initialPermissions, u.statusId]);

        res.json({ success: true, message: 'Usuario y permisos actualizados correctamente' });
    } else {
        // INSERT
        if (!u.password) {
            return res.status(400).json({ error: "La contraseña es obligatoria para nuevos usuarios" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(u.password, salt);

        const clientIds = (Array.isArray(u.clientIds) && u.clientIds.length > 0) 
                           ? u.clientIds 
                           : (u.clientId ? [u.clientId] : []);

        await pool.query(`
          INSERT INTO users (id, email, name, password, role_id, client_ids, status_id, phone, avatar, document_type, document_number, two_factor_enabled)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [u.id, u.email, u.name, hashedPassword, u.roleId, clientIds, u.statusId, u.phone, u.avatar, u.documentType, u.documentNumber, u.twoFactorEnabled]);
        const roleId = u.roleId || u.role_id || 'ROL-02';
        console.log(`[M7-USERS] Inicializando permisos para usuario ${u.id} con rol ${roleId}`);
        
        const rolePermsResult = await pool.query('SELECT permissions FROM role_permissions WHERE role_id = $1', [roleId]);
        let permissionsObj = rolePermsResult.rows.length > 0 ? rolePermsResult.rows[0].permissions : {};
        
        // Convertir string a objeto si es necesario
        if (typeof permissionsObj === 'string') {
            try { permissionsObj = JSON.parse(permissionsObj); } catch(e) { permissionsObj = {}; }
        }

        // GARANTÍA NUCLEAR: Si es Admin, tiene acceso a Grupo Inter (PAG-31)
        if (roleId === 'ROL-01') {
            permissionsObj['PAG-31'] = { view: true, create: true, edit: true, delete: true, active: true };
            permissionsObj['page_PAG-31_view'] = true;
            permissionsObj['page_PAG-31_create'] = true;
            permissionsObj['page_PAG-31_edit'] = true;
            permissionsObj['page_PAG-31_delete'] = true;
            permissionsObj['page_PAG-31_active'] = true;
        }

        await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [u.id]);
        await pool.query(`
          INSERT INTO user_permissions (id, user_id, permissions, status_id)
          VALUES ($1, $2, $3, $4)
        `, [`PUS-${u.id}`, u.id, JSON.stringify(permissionsObj), u.statusId || 'EST-01']);

        console.log(`[M7-USERS] ✅ Permisos sincronizados para ${u.email}`);
        res.json({ success: true, message: 'Usuario creado/editado y perfil de permisos sincronizado' });
    }
} catch (err: any) {
    console.error('[M7-USERS] Error saving user:', err);
    res.status(500).json({ error: "Error al guardar el usuario: " + err.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;

  try {
    // Validar que no se borre a sí mismo o al admin principal
    if (id === 'USR-01' || id === 'U-001') {
      return res.status(403).json({ error: "No se puede eliminar al Super Administrador" });
    }

    // Auditoría: Obtener el registro antes de borrar
    const record = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['users', id, record.rows[0], deletedBy || 'Unknown']
      );
    }
    
    // The diff provided a snippet that looks like a Layout.tsx change.
    // `    menuGroups.push({
    //       id: 'admin-group',
    //       label: 'ADMINISTRACIÓN',
    //       icon: getIcon('Shield'), // Assuming Shield icon exists, or use Lock/Settings
    //       items: [
    //         { id: 'admin-db-page', label: 'Gestor DB', module: 'admin-db' as any, masterCat: '' as any }
    //       ]
    //     });
    //   } */
    //
    //   const selectItem = (item: any) => {`
    // This is completely out of context for a user controller.
    // I will ignore this part of the diff as it's not applicable to this file.

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ success: true, message: 'Usuario eliminado correctamente y auditado' });
  } catch (err: any) {
    console.error('[M7-USERS] Error deleting user:', err);
    res.status(500).json({ error: "Error al eliminar usuario: " + err.message });
  }
};
