import { Request, Response } from 'express';
import pool from '../config/database.js';

const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tarifas_linea_blanca (
      id SERIAL PRIMARY KEY,
      destino TEXT NOT NULL,
      articulo TEXT NOT NULL,
      precio NUMERIC(15,2) NOT NULL,
      usuario_creacion TEXT,
      fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(destino, articulo)
    )
  `);
};

export const getTarifas = async (req: Request, res: Response) => {
  try {
    await initTable();
    const result = await pool.query('SELECT * FROM tarifas_linea_blanca ORDER BY destino ASC, articulo ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-TARIFAS-LB] Error getting tarifas:', err);
    res.status(500).json({ error: 'Error al obtener tarifas de línea blanca' });
  }
};

export const saveTarifa = async (req: Request, res: Response) => {
  const { id, destino, articulo, precio, usuarioControl } = req.body;

  if (!destino || String(destino).trim() === '') {
    return res.status(400).json({ success: false, error: 'El destino es obligatorio.' });
  }
  if (!articulo || String(articulo).trim() === '') {
    return res.status(400).json({ success: false, error: 'El artículo es obligatorio.' });
  }
  if (precio === undefined || isNaN(Number(precio))) {
    return res.status(400).json({ success: false, error: 'El precio es obligatorio y debe ser un número válido.' });
  }

  try {
    await initTable();
    const p = parseFloat(precio);
    let result;

    if (id) {
      result = await pool.query(`
        UPDATE tarifas_linea_blanca SET
          destino = $1,
          articulo = $2,
          precio = $3,
          usuario_creacion = $4
        WHERE id = $5
        RETURNING *
      `, [
        String(destino).trim().toUpperCase(),
        String(articulo).trim().toUpperCase(),
        p,
        usuarioControl || 'System',
        id
      ]);
    } else {
      result = await pool.query(`
        INSERT INTO tarifas_linea_blanca (destino, articulo, precio, usuario_creacion, fecha_creacion)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (destino, articulo) DO UPDATE SET
          precio = $3,
          usuario_creacion = $4
        RETURNING *
      `, [
        String(destino).trim().toUpperCase(),
        String(articulo).trim().toUpperCase(),
        p,
        usuarioControl || 'System'
      ]);
    }

    res.json({ success: true, message: 'Tarifa guardada correctamente', record: result.rows[0] });
  } catch (err: any) {
    console.error('[M7-TARIFAS-LB] Error saving tarifa:', err);
    res.status(500).json({ error: 'Error al guardar la tarifa' });
  }
};

export const deleteTarifa = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'El ID es requerido' });
  }

  try {
    await initTable();
    const result = await pool.query('DELETE FROM tarifas_linea_blanca WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }
    res.json({ success: true, message: 'Tarifa eliminada con éxito' });
  } catch (err: any) {
    console.error('[M7-TARIFAS-LB] Error deleting tarifa:', err);
    res.status(500).json({ error: 'Error al eliminar la tarifa' });
  }
};

export const bulkSaveTarifas = async (req: Request, res: Response) => {
  const { items, usuarioControl } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Lista de tarifas inválida' });
  }

  const client = await pool.connect();
  try {
    await initTable();
    await client.query('BEGIN');

    for (const item of items) {
      const destino = item.destino ? String(item.destino).trim().toUpperCase() : null;
      const articulo = item.articulo ? String(item.articulo).trim().toUpperCase() : null;
      const precio = item.precio !== undefined ? parseFloat(item.precio) : null;

      if (!destino || !articulo || precio === null || isNaN(precio)) continue;

      await client.query(`
        INSERT INTO tarifas_linea_blanca (destino, articulo, precio, usuario_creacion, fecha_creacion)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (destino, articulo) DO UPDATE SET
          precio = $3,
          usuario_creacion = $4
      `, [
        destino,
        articulo,
        precio,
        usuarioControl || 'System'
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Importación masiva completada exitosamente' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[M7-TARIFAS-LB] Bulk save error:', err);
    res.status(500).json({ error: 'Error al procesar la importación masiva de tarifas' });
  } finally {
    client.release();
  }
};
