import pool from '../config/database.js';
import { Request, Response } from 'express';

const parseDate = (val: any): Date | null => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    if (val > 10000 && val < 100000) return new Date(Math.round((val - 25569) * 86400 * 1000));
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 's/i' || str.toLowerCase() === 'null') return null;
  const dmyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/;
  const match = str.match(dmyRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const cleanStr = (val: any) => {
  if (val === null || val === undefined) return '';
  return String(val).trim();
};

export const uploadPreoperacionalReports = async (records: any[]): Promise<number> => {
  if (!Array.isArray(records) || records.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertQuery = `
      INSERT INTO preoperacional_respuestas (
        oc_number, id_orden, fecha, manifest_number, id_manifest,
        driver_name, driver_document, id_driver, plate, vehicle_model,
        id_vehicle, estado, firmado, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      ON CONFLICT (oc_number, fecha) DO UPDATE SET
        id_orden = EXCLUDED.id_orden,
        manifest_number = EXCLUDED.manifest_number,
        id_manifest = EXCLUDED.id_manifest,
        driver_name = EXCLUDED.driver_name,
        driver_document = EXCLUDED.driver_document,
        id_driver = EXCLUDED.id_driver,
        plate = EXCLUDED.plate,
        vehicle_model = EXCLUDED.vehicle_model,
        id_vehicle = EXCLUDED.id_vehicle,
        estado = EXCLUDED.estado,
        firmado = EXCLUDED.firmado,
        updated_at = CURRENT_TIMESTAMP;
    `;

    let insertedCount = 0;
    for (const row of records) {
      const oc_number = cleanStr(row['Orden de cargue'] || row['Orden de Cargue'] || row['Orden de Cargue '] || row.oc_number || row.ocNumber);
      if (!oc_number) continue;

      const fecha = parseDate(row['Fecha'] || row.fecha || row.date);
      if (!fecha) continue;

      const fechaIso = fecha.toISOString().slice(0, 10);
      const id_orden = cleanStr(row['ID Orden'] || row['Id Orden'] || row.id_orden);
      const manifest_number = cleanStr(row['Manifiesto'] || row.manifest_number);
      const id_manifest = cleanStr(row['ID Manifiesto'] || row['Id Manifiesto'] || row.id_manifest);
      const driver_name = cleanStr(row['Conductor'] || row.driver_name);
      const driver_document = cleanStr(row['Doc. Conductor'] || row['Doc conductor'] || row['Documento'] || row.driver_document);
      const id_driver = cleanStr(row['ID Conductor'] || row['Id Conductor'] || row.id_driver);
      const plate = cleanStr(row['Placa'] || row['Vehículo'] || row['Vehiculo'] || row['ID Vehículo'] || row['ID Vehiculo'] || row.plate).toUpperCase();
      const vehicle_model = cleanStr(row['Modelo'] || row.vehicle_model);
      const id_vehicle = cleanStr(row['ID Vehículo'] || row['ID Vehiculo'] || row.id_vehicle);
      const estado = cleanStr(row['Estado Preoperacional'] || row['Estado preoperacional'] || row['Estado'] || row.estado || 'Pendiente');
      const firmado = cleanStr(row['Cuestionario Firmado'] || row['Cuestionario firmado'] || row['Firmado'] || row.firmado);

      await client.query(insertQuery, [
        oc_number, id_orden, fechaIso, manifest_number, id_manifest,
        driver_name, driver_document, id_driver, plate, vehicle_model,
        id_vehicle, estado, firmado
      ]);
      insertedCount++;
    }

    await client.query('COMMIT');
    return insertedCount;
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-PREOPERACIONAL-UPLOAD-ERR]', err);
    throw err;
  } finally {
    client.release();
  }
};

export const handleUploadPreoperacionalHttp = async (req: Request, res: Response) => {
  try {
    const { records } = req.body;
    const count = await uploadPreoperacionalReports(records);
    res.json({ success: true, count, message: `Se procesaron ${count} registros preoperacionales con éxito.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al procesar registros preoperacionales', details: err.message });
  }
};
