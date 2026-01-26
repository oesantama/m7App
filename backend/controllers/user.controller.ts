
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY name ASC');
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
    await pool.query(`
      INSERT INTO users (id, email, name, password, role_id, client_id, status_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
      email = $2, name = $3, password = $4, role_id = $5, client_id = $6, status_id = $7
    `, [u.id, u.email, u.name, u.password, u.roleId, u.clientId, u.statusId]);
    res.json({ success: true, message: 'Usuario guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el usuario" });
  }
};
