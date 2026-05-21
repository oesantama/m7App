import { Request, Response } from 'express';
import pool from '../config/database.js';

export const getProvClientes = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM prov_cliente ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-PROV-CLIENTE] Error getting providers:', err);
    res.status(500).json({ error: 'Error al obtener proveedores de clientes' });
  }
};

export const saveProvCliente = async (req: Request, res: Response) => {
  const {
    documento,
    nombre,
    contacto,
    email,
    representante,
    estado,
    usuarioControl,
    client_mappings
  } = req.body;

  if (!documento || String(documento).trim() === '') {
    return res.status(400).json({ success: false, error: 'El documento es obligatorio.' });
  }
  if (!nombre || String(nombre).trim() === '') {
    return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
  }

  try {
    const mappingsJson = JSON.stringify(Array.isArray(client_mappings) ? client_mappings : []);
    const result = await pool.query(`
      INSERT INTO prov_cliente (documento, nombre, contacto, email, representante, estado, usuario_creacion, fecha_creacion, client_mappings)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)
      ON CONFLICT (documento) DO UPDATE SET
        nombre = $2,
        contacto = $3,
        email = $4,
        representante = $5,
        estado = $6,
        usuario_creacion = $7,
        client_mappings = $8
      RETURNING *
    `, [
      String(documento).trim().toUpperCase(),
      String(nombre).trim().toUpperCase(),
      contacto ? String(contacto).trim() : null,
      email ? String(email).trim().toLowerCase() : null,
      representante ? String(representante).trim().toUpperCase() : null,
      estado || 'EST-01',
      usuarioControl || 'System',
      mappingsJson
    ]);

    res.json({ success: true, message: 'Proveedor guardado correctamente', record: result.rows[0] });
  } catch (err: any) {
    console.error('[M7-PROV-CLIENTE] Error saving provider:', err);
    res.status(500).json({ error: 'Error al guardar el proveedor de cliente' });
  }
};

export const deleteProvCliente = async (req: Request, res: Response) => {
  const { id: documento } = req.params;

  if (!documento) {
    return res.status(400).json({ error: 'El documento es requerido' });
  }

  try {
    const result = await pool.query('DELETE FROM prov_cliente WHERE documento = $1 RETURNING documento', [documento]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json({ success: true, message: 'Proveedor de cliente eliminado con éxito' });
  } catch (err: any) {
    console.error('[M7-PROV-CLIENTE] Error deleting provider:', err);
    res.status(500).json({ error: 'Error al eliminar el proveedor de cliente' });
  }
};

export const bulkSaveProvClientes = async (req: Request, res: Response) => {
  const { items, usuarioControl } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Lista de proveedores inválida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const documento = item.documento ? String(item.documento).trim().toUpperCase() : null;
      const nombre = item.nombre ? String(item.nombre).trim().toUpperCase() : null;

      if (!documento || !nombre) continue;

      await client.query(`
        INSERT INTO prov_cliente (documento, nombre, contacto, email, representante, estado, usuario_creacion, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (documento) DO UPDATE SET
          nombre = $2,
          contacto = COALESCE($3, prov_cliente.contacto),
          email = COALESCE($4, prov_cliente.email),
          representante = COALESCE($5, prov_cliente.representante),
          estado = COALESCE($6, prov_cliente.estado),
          usuario_creacion = $7
      `, [
        documento,
        nombre,
        item.contacto ? String(item.contacto).trim() : null,
        item.email ? String(item.email).trim().toLowerCase() : null,
        item.representante ? String(item.representante).trim().toUpperCase() : null,
        item.estado || 'EST-01',
        usuarioControl || 'System'
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Importación masiva completada exitosamente' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-PROV-CLIENTE] Bulk save error:', err);
    res.status(500).json({ error: 'Error al procesar la importación masiva de proveedores' });
  } finally {
    client.release();
  }
};
