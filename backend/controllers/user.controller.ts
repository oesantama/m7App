
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.email, u.name, 
        u.role_id AS "roleId", 
        u.status_id AS "statusId",
        u.two_factor_enabled AS "twoFactorEnabled",
        u.phone, u.avatar,
        u.document_type AS "documentType",
        u.document_number AS "documentNumber",
        ds.approved AS "isApproved",
        (ds.digital_signature IS NOT NULL) AS "hasSignature"
      FROM users u
      LEFT JOIN digital_signatures ds ON u.email = ds.document_number
      ORDER BY u.name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-USERS] Offline Mode activo');
    res.json([
        { id: 'U-001', name: 'ADMINISTRADOR PRINCIPAL', email: 'admin@millasiete.com', roleId: 'ROL-01', statusId: 'EST-01' },
        { id: 'U-002', name: 'OPERADOR LOGÍSTICO', email: 'operaciones@millasiete.com', roleId: 'ROL-03', statusId: 'EST-01' },
        { id: 'U-003', name: 'AUDITOR CALIDAD', email: 'calidad@millasiete.com', roleId: 'ROL-04', statusId: 'EST-01' }
    ]); 
  }
};

export const saveUser = async (req: Request, res: Response) => {
  const u = req.body;
  try {
    // 1. Verificar si el usuario ya existe
    const check = await pool.query('SELECT password FROM users WHERE id = $1', [u.id]);
    
    if (check.rows.length > 0) {
        // UPDATE
        const currentPass = check.rows[0].password;
        const newPass = u.password || currentPass; // Mantener anterior si no envían uno nuevo
        // Asegurar que clientIds sea un array
        const clientIds = Array.isArray(u.clientIds) ? u.clientIds : (u.clientId ? [u.clientId] : []);
        
        await pool.query(`
          UPDATE users 
          SET email = $2, name = $3, password = $4, role_id = $5, client_ids = $6, status_id = $7,
              phone = $8, avatar = $9, document_type = $10, document_number = $11, two_factor_enabled = $12,
              updated_by = $13, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [u.id, u.email, u.name, newPass, u.roleId, clientIds, u.statusId, u.phone, u.avatar, u.documentType, u.documentNumber, u.twoFactorEnabled, u.updatedBy || 'System']);
        
        // ASEGURAR QUE EL REGISTRO DE PERMISOS EXISTA (BACK-FILL SI FALTA)
        await pool.query(`
          INSERT INTO user_permissions (id, user_id, permissions, status_id, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO NOTHING
        `, [`PUS-${u.id}`, u.id, '{}', u.statusId, u.updatedBy || 'System']);

        res.json({ success: true, message: 'Usuario actualizado correctamente' });
    } else {
        // INSERT (Password es obligatorio)
        if (!u.password) {
            res.status(400).json({ error: "La contraseña es obligatoria para nuevos usuarios" });
            return;
        }
        // Asegurar que clientIds sea un array
        const clientIds = Array.isArray(u.clientIds) ? u.clientIds : (u.clientId ? [u.clientId] : []);

        await pool.query(`
          INSERT INTO users (id, email, name, password, role_id, client_ids, status_id, phone, avatar, document_type, document_number, two_factor_enabled)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [u.id, u.email, u.name, u.password, u.roleId, clientIds, u.statusId, u.phone, u.avatar, u.documentType, u.documentNumber, u.twoFactorEnabled]);
        
        // CREAR REGISTRO DE PERMISOS INICIAL (SI NO EXISTE)
        await pool.query(`
          INSERT INTO user_permissions (id, user_id, permissions, status_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id) DO NOTHING
        `, [`PUS-${u.id}`, u.id, '{}', u.statusId]);

        res.json({ success: true, message: 'Usuario creado y perfil de permisos inicializado' });
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
