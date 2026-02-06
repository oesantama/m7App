
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDrivers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-DRIVERS] Error fetching:', err);
    res.json([]);
  }
};

export const saveDriver = async (req: Request, res: Response) => {
  const d = req.body;
  try {
    await pool.query(`
      INSERT INTO drivers (
        id, name, document_type, document_number, phone, client_id, 
        license_expiry, license_pdf, status_id, license_side_a, license_side_b,
        license_category
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, document_type = $3, document_number = $4, phone = $5, client_id = $6,
        license_expiry = $7, license_pdf = $8, status_id = $9, license_side_a = $10, license_side_b = $11,
        license_category = $12
    `, [
      d.id, d.name, d.documentType, d.documentNumber, d.phone, d.clientId,
      d.licenseExpiry, d.licensePdf, d.statusId, d.licenseSideA, d.licenseSideB,
      d.licenseCategory
    ]);
    res.json({ success: true, message: 'Conductor guardado' });
  } catch (err: any) {
    console.error('[M7-DRIVERS] Error saving:', err);
    res.status(500).json({ error: "Error al guardar el conductor" });
  }
};

export const deleteDriver = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deletedBy } = req.query;

  try {
    // Auditoría: Obtener el registro antes de borrar
    const record = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
    if (record.rows.length > 0) {
      await pool.query(
        'INSERT INTO deletion_logs (table_name, record_id, record_data, deleted_by) VALUES ($1, $2, $3, $4)',
        ['drivers', id, record.rows[0], deletedBy || 'Unknown']
      );
    }

    await pool.query('DELETE FROM drivers WHERE id = $1', [id]);
    res.json({ success: true, message: 'Conductor eliminado y auditado' });
  } catch (err: any) {
    console.error('[M7-DRIVERS] Error deleting:', err);
    res.status(500).json({ error: "Error al eliminar conductor" });
  }
};
