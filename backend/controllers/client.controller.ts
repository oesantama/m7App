
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getClients = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-CLIENTS] Usando datos offline por falta de DB');
    // Mock Data para Demo
    res.json([
        { id: 'CLI-001', name: 'M7 GLOBAL LOGISTICS', statusId: 'EST-01', logoUrl: '' },
        { id: 'CLI-002', name: 'TRANSPORTES RÁPIDOS S.A.S', statusId: 'EST-01', logoUrl: '' },
        { id: 'CLI-003', name: 'DISTRIBUIDORA DEL NORTE', statusId: 'EST-01', logoUrl: '' }
    ]);
  }
};

export const saveClient = async (req: Request, res: Response) => {
  const c = req.body;
  try {
    await pool.query(`
      INSERT INTO clients (id, name, logo_url, status_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, logo_url = $3, status_id = $4
    `, [c.id, c.name, c.logoUrl, c.statusId]);
    res.json({ success: true, message: 'Cliente guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "No se pudo guardar el cliente" });
  }
};
