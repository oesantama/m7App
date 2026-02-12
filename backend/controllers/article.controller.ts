
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
      INSERT INTO articles (
        id, sku, name, client_id, status_id, 
        barcode, category_articulo_id, factor_inter, factor_std,
        uom_general_id, uom_inter_id, uom_std_id, client_ids
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        sku = $2, name = $3, client_id = $4, status_id = $5,
        barcode = $6, category_articulo_id = $7, factor_inter = $8, factor_std = $9,
        uom_general_id = $10, uom_inter_id = $11, uom_std_id = $12, client_ids = $13
    `, [
      a.id, a.sku, a.name, a.clientId || (a.clientIds && a.clientIds[0]), a.statusId,
      a.barcode, a.categoryArticuloId, a.factorInter || 1, a.factorStd || 1,
      a.uomGeneralId, a.uomInterId, a.uomStdId, a.clientIds || []
    ]);

    // CRITICAL FIX: Return the complete article object to enable frontend state update
    const savedArticle = {
      id: a.id,
      sku: a.sku,
      name: a.name,
      clientIds: a.clientIds || [],
      statusId: a.statusId,
      barcode: a.barcode,
      categoryArticuloId: a.categoryArticuloId,
      factorInter: a.factorInter || 1,
      factorStd: a.factorStd || 1,
      uomGeneralId: a.uomGeneralId,
      uomInterId: a.uomInterId,
      uomStdId: a.uomStdId
    };

    res.json({
      success: true,
      message: 'Artículo guardado',
      id: a.id,  // Include ID for compatibility
      article: savedArticle  // Include full object for state updates
    });
  } catch (err: any) {
    console.error('[M7-ARTICLES] Save error:', err);
    res.status(500).json({ error: "Error al guardar el artículo" });
  }
};


export const deleteArticle = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  try {
    const record = await pool.query('SELECT * FROM articles WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['articles', id, record.rows[0], deletedBy || 'Unknown']
      );
    }
    const result = await pool.query('DELETE FROM articles WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Artículo no encontrado" });
    res.json({ success: true, message: 'Artículo eliminado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar el artículo" });
  }
};
