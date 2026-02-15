
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getClients = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-CLIENTS] Database connection failed');
    res.json([]);
  }
};

export const saveClient = async (req: Request, res: Response) => {
  const c = req.body;
  try {
    await pool.query(`
      INSERT INTO clients (id, name, logo_url, status_id, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
      name = $2, logo_url = $3, status_id = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
    `, [c.id, c.name, c.logoUrl, c.statusId, c.createdBy || c.updatedBy || 'System']);
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
