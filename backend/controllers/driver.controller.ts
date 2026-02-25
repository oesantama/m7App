
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getDrivers = async (req: Request, res: Response) => {
  try {
    // Reparación de esquema bajo demanda
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_side_a TEXT;');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_side_b TEXT;');
    await pool.query('ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_category TEXT;');

    const result = await pool.query('SELECT * FROM drivers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.warn('[M7-DRIVERS] Error fetching or repairing schema:', err.message);
    res.json([]);
  }
};

export const saveDriver = async (req: Request, res: Response) => {
  const d = req.body;
  try {
    let driverId = d.id;
    if (!driverId) {
      // Filtrar por IDs que terminan en exactamente 3 dígitos para evitar desbordamientos con IDs antiguos
      const lastIdResult = await pool.query("SELECT MAX(substring(id from 5)::bigint) as max_id FROM drivers WHERE id ~ '^DRV-[0-9]{3}$'");
      const maxId = lastIdResult.rows[0].max_id || 0;
      driverId = `DRV-${(Number(maxId) + 1).toString().padStart(3, '0')}`;
    }
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
      driverId, d.name, d.documentType || d.document_type, d.documentNumber || d.document_number, 
      d.phone, d.clientId || d.client_id,
      d.licenseExpiry || d.license_expiry, d.licensePdf || d.license_pdf, 
      d.statusId || d.status_id || 'EST-01', 
      d.licenseSideA || d.license_side_a, d.licenseSideB || d.license_side_b,
      d.licenseCategory || d.license_category
    ]);
    res.json({ success: true, message: 'Conductor guardado', id: driverId });
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

export const bulkSaveDrivers = async (req: Request, res: Response) => {
  const { drivers } = req.body;
  if (!Array.isArray(drivers)) return res.status(400).json({ error: 'Data must be an array' });

  try {
    await pool.query('BEGIN');

    // Obtener el último ID base para autoincrementar
    const lastIdResult = await pool.query("SELECT MAX(substring(id from 5)::bigint) as max_id FROM drivers WHERE id ~ '^DRV-[0-9]{3}$'");
    let currentMax = Number(lastIdResult.rows[0].max_id || 0);

    for (const d of drivers) {
      let driverId = d.id;
      if (!driverId) {
        currentMax++;
        driverId = `DRV-${currentMax.toString().padStart(3, '0')}`;
      }

      await pool.query(`
        INSERT INTO drivers (
          id, name, document_type, document_number, phone, client_id, 
          license_expiry, status_id, license_category
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          document_type = EXCLUDED.document_type,
          document_number = EXCLUDED.document_number,
          phone = EXCLUDED.phone,
          license_expiry = EXCLUDED.license_expiry,
          license_category = EXCLUDED.license_category,
          status_id = EXCLUDED.status_id
      `, [
        driverId, d.name, d.documentType || 'CC', d.documentNumber, 
        d.phone || '', d.clientId || 'CLI-01',
        d.licenseExpiry || null, d.statusId || 'EST-01', d.licenseCategory || ''
      ]);
    }

    await pool.query('COMMIT');
    res.json({ success: true, message: `Se procesaron ${drivers.length} conductores` });
  } catch (err: any) {
    await pool.query('ROLLBACK');
    console.error('[M7-DRIVERS] Bulk Save Error:', err);
    res.status(500).json({ error: "Error en carga masiva: " + err.message });
  }
};
