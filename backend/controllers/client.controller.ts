
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getClients = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isSuper = user?.role_id === 'ROL-01' || user?.email === 'admin@millasiete.com';
    
    let query = 'SELECT * FROM clients';
    let params: any[] = [];

    if (!isSuper) {
      // Filtrado Real: Solo clientes permitidos para el usuario
      const allowedIds = user?.client_ids || [];
      query += ' WHERE id = ANY($1::text[])';
      params.push(allowedIds);
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-CLIENTS] Fetch failed:', err);
    res.json([]);
  }
};

export const saveClient = async (req: Request, res: Response) => {
  const c = req.body;
  try {
    await pool.query(`
      INSERT INTO clients (id, name, logo_url, status_id, client_type, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, logo_url = $3, status_id = $4, client_type = $5, updated_by = $6, updated_at = CURRENT_TIMESTAMP
    `, [c.id, c.name, c.logoUrl, c.statusId, c.clientType || 'MUNICIPAL', c.createdBy || c.updatedBy || 'System']);
    res.json({ success: true, message: 'Cliente guardado' });
  } catch (err: any) {
    res.status(500).json({ error: "No se pudo guardar el cliente" });
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;
  try {
    const record = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['clients', id, record.rows[0], deletedBy || 'Unknown']
      );
    }
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar el cliente", details: err.detail || err.message });
  }
};
