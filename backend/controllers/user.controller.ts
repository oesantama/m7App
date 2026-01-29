
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, email, name, 
        role_id AS "roleId", 
        status_id AS "statusId" 
      FROM users 
      ORDER BY name ASC
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
        const newPass = u.password || currentPass; // Mantener anterior si no envÃ­an uno nuevo
        
        await pool.query(`
          UPDATE users 
          SET email = $2, name = $3, password = $4, role_id = $5, client_id = $6, status_id = $7
          WHERE id = $1
        `, [u.id, u.email, u.name, newPass, u.roleId, u.clientId, u.statusId]);
        
        res.json({ success: true, message: 'Usuario actualizado corrextamente' });
    } else {
        // INSERT (Password es obligatorio)
        if (!u.password) {
            res.status(400).json({ error: "La contraseÃ±a es obligatoria para nuevos usuarios" });
            return;
        }
        await pool.query(`
          INSERT INTO users (id, email, name, password, role_id, client_id, status_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [u.id, u.email, u.name, u.password, u.roleId, u.clientId, u.statusId]);
        
        res.json({ success: true, message: 'Usuario creado correctamente' });
    }
  } catch (err: any) {
    console.error('[M7-USERS] Error saving user:', err);
    res.status(500).json({ error: "Error al guardar el usuario: " + err.message });
  }
};
