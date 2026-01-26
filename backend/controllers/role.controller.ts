
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-ROLES] Offline Mode activo');
    res.json([
        { id: 'ROL-01', name: 'SUPERUSUARIO', statusId: 'EST-01' },
        { id: 'ROL-02', name: 'ADMINISTRADOR', statusId: 'EST-01' },
        { id: 'ROL-03', name: 'OPERADOR', statusId: 'EST-01' },
        { id: 'ROL-04', name: 'AUDITOR', statusId: 'EST-01' }
    ]); 
  }
};

export const saveRole = async (req: Request, res: Response) => {
  const r = req.body;
  try {
    await pool.query(`
      INSERT INTO roles (id, name, status_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, status_id = $3
    `, [r.id, r.name, r.statusId]);
    res.json({ success: true, message: 'Rol guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el rol" });
  }
};
