
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getModules = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM modules ORDER BY name ASC');
    if (result.rows.length > 0) {
        res.json(result.rows);
        return;
    }
    
    console.warn('[M7-MODULES] Sembrando datos mock (DB vacía)');
    res.json([
        { id: 'MOD-01', name: 'CONFIGURACIÓN MAESTROS', iconClass: 'Settings', statusId: 'EST-01' },
        { id: 'MOD-02', name: 'GESTIÓN AJOVER', iconClass: 'Package', statusId: 'EST-01' },
        { id: 'MOD-03', name: 'GESTIÓN TRANSPORTE', iconClass: 'Truck', statusId: 'EST-01' },
        { id: 'MOD-04', name: 'SEGURIDAD & ACCESO', iconClass: 'Shield', statusId: 'EST-01' }
    ]); 
  } catch (err: any) {
    res.status(500).json({ error: "Error fatal en controlador" });
  }
};

export const saveModule = async (req: Request, res: Response) => {
  const m = req.body;
  try {
    await pool.query(`
      INSERT INTO modules (id, name, icon_class, status_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, icon_class = $3, status_id = $4
    `, [m.id, m.name, m.iconClass, m.statusId]);
    res.json({ success: true, message: 'Módulo guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el módulo" });
  }
};
