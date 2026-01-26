
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getArticles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM articles ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-ARTICLES] Offline Mode activo');
    res.json([]); 
  }
};

export const saveArticle = async (req: Request, res: Response) => {
  const a = req.body;
  try {
    await pool.query(`
      INSERT INTO articles (id, sku, name, client_id, uom_std, factor_std, status_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
      sku = $2, name = $3, client_id = $4, uom_std = $5, factor_std = $6, status_id = $7
    `, [a.id, a.sku, a.name, a.clientId, a.uomStd, a.factorStd, a.statusId]);
    res.json({ success: true, message: 'Artículo guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al guardar el artículo" });
  }
};
