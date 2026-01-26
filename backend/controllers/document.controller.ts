
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDocuments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
      (SELECT json_agg(i.*) FROM document_items i WHERE i.document_id = d.id) as items
      FROM documents_l d
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Falla al obtener documentos" });
  }
};

export const syncInventory = async (req: Request, res: Response) => {
  const { docId, items, user, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      UPDATE documents_l 
      SET status = 'Inventariado', inventory_date = NOW(), inventory_user = $1, inventory_notes = $2
      WHERE id = $3
    `, [user, notes, docId]);

    for (const item of items) {
      await client.query(`
        UPDATE document_items 
        SET count_1 = $1, count_2 = $2, notes = $3 
        WHERE document_id = $4 AND article_id = $5
      `, [item.count1, item.count2, item.inventoryNote, docId, item.articleId]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Error de sincronización operacional" });
  } finally {
    client.release();
  }
};
