import { Request, Response } from 'express';
import pool from '../config/database.js';

export const saveConciliacion = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { 
      nombre_archivo, 
      mes_anio, 
      stats, 
      usuario_creacion, 
      detalles 
    } = req.body;

    await client.query('BEGIN');

    // Insertar el archivo (cabecera)
    const resultArchivo = await client.query(
      `INSERT INTO conciliacion_lb_archivos (
        nombre_archivo, mes_anio, total_registros, coincidencias, discrepancias,
        novedades, total_milla7, diferencia_neta, usuario_creacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        nombre_archivo,
        mes_anio,
        stats.totalRegistros || 0,
        stats.coincidencias || 0,
        stats.discrepancias || 0,
        stats.novedades || 0,
        stats.totalMilla7 || 0,
        stats.diferenciaNeta || 0,
        usuario_creacion
      ]
    );

    const archivoId = resultArchivo.rows[0].id;
    let guardados = 0;
    let actualizados = 0;

    // Insertar los detalles
    for (const detalle of detalles) {
      // Validar si es repetido basado en systram y viaje_pedido
      const sys = detalle.systram ? detalle.systram.toString().trim() : '';
      const viaje = detalle.viajePedido ? detalle.viajePedido.toString().trim() : '';
      
      let existingId = null;
      if (sys && viaje) {
        const check = await client.query(
          `SELECT id FROM conciliacion_lb_detalles WHERE systram = $1 AND viaje_pedido = $2`,
          [sys, viaje]
        );
        if (check.rows.length > 0) {
          existingId = check.rows[0].id;
        }
      }

      if (existingId) {
        await client.query(
          `UPDATE conciliacion_lb_detalles SET
            archivo_id = $1, fecha = $2, placa = $3, destino = $4, articulo = $5,
            precio_archivo_base = $6, precio_70_base = $7, precio_conciliacion = $8, diferencia = $9,
            valor_adicional = $10, total_milla7 = $11, estado = $12, tipo_validacion = $13, notas_validacion = $14, notas2 = $15
           WHERE id = $16`,
          [
            archivoId, detalle.fecha || '', detalle.placa || '', detalle.destino || '', detalle.articulo || '',
            detalle.precioArchivo1 || 0, detalle.precio70Base || 0, detalle.precioArchivo2 || 0, detalle.diferencia || 0,
            detalle.valorAdicional || 0, detalle.totalMilla7 || 0, detalle.estado || '', detalle.tipoValidacion || '',
            detalle.notasValidacion || '', detalle.notas2 || '', existingId
          ]
        );
        actualizados++;
      } else {
        await client.query(
          `INSERT INTO conciliacion_lb_detalles (
            archivo_id, fecha, placa, systram, viaje_pedido, destino, articulo,
            precio_archivo_base, precio_70_base, precio_conciliacion, diferencia,
            valor_adicional, total_milla7, estado, tipo_validacion, notas_validacion, notas2
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            archivoId, detalle.fecha || '', detalle.placa || '', sys, viaje, detalle.destino || '', detalle.articulo || '',
            detalle.precioArchivo1 || 0, detalle.precio70Base || 0, detalle.precioArchivo2 || 0, detalle.diferencia || 0,
            detalle.valorAdicional || 0, detalle.totalMilla7 || 0, detalle.estado || '', detalle.tipoValidacion || '',
            detalle.notasValidacion || '', detalle.notas2 || ''
          ]
        );
        guardados++;
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: `Guardado con éxito. Registros nuevos: ${guardados}. Actualizados: ${actualizados}`, archivoId, guardados, actualizados });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error guardando conciliacion LB:', err);
    res.status(500).json({ success: false, message: 'Error interno guardando la conciliación' });
  } finally {
    client.release();
  }
};

export const getHistorialConciliaciones = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM conciliacion_lb_archivos ORDER BY fecha_creacion DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo historial conciliaciones LB:', err);
    res.status(500).json({ success: false, message: 'Error interno obteniendo el historial' });
  }
};

export const getDetallesConciliacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM conciliacion_lb_detalles WHERE archivo_id = $1 ORDER BY id ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error obteniendo detalles conciliacion LB:', err);
    res.status(500).json({ success: false, message: 'Error interno obteniendo detalles' });
  }
};

export const searchDetalles = async (req: Request, res: Response) => {
  const { fecha_desde, fecha_hasta, placa, systram, pedido } = req.query;
  
  let query = `SELECT * FROM conciliacion_lb_detalles WHERE 1=1`;
  const params: any[] = [];
  let paramCount = 1;

  if (fecha_desde) {
    const excelSerialDesde = (new Date(fecha_desde as string).getTime() / 86400000) + 25569;
    query += ` AND (fecha >= $${paramCount} OR (fecha ~ '^[0-9]+$' AND fecha::numeric >= $${paramCount + 1}))`;
    params.push(fecha_desde, excelSerialDesde);
    paramCount += 2;
  }
  if (fecha_hasta) {
    const excelSerialHasta = (new Date(fecha_hasta as string).getTime() / 86400000) + 25569;
    query += ` AND (fecha <= $${paramCount} OR (fecha ~ '^[0-9]+$' AND fecha::numeric <= $${paramCount + 1}))`;
    params.push(fecha_hasta, excelSerialHasta);
    paramCount += 2;
  }
  if (placa) {
    query += ` AND placa ILIKE $${paramCount++}`;
    params.push(`%${placa}%`);
  }
  if (systram) {
    query += ` AND systram ILIKE $${paramCount++}`;
    params.push(`%${systram}%`);
  }
  if (pedido) {
    query += ` AND viaje_pedido ILIKE $${paramCount++}`;
    params.push(`%${pedido}%`);
  }

  query += ` ORDER BY id ASC`;

  try {
    const result = await pool.query(query, params);
    
    // Map snake_case to camelCase just as it was in the frontend validation object
    const mapped = result.rows.map(row => ({
      index: row.id, // For UI purposes
      fecha: row.fecha,
      placa: row.placa,
      systram: row.systram,
      viajePedido: row.viaje_pedido,
      destino: row.destino,
      articulo: row.articulo,
      precioArchivo1: row.precio_archivo_base,
      precio70Base: row.precio_70_base,
      precioArchivo2: row.precio_conciliacion,
      diferencia: row.diferencia,
      valorAdicional: row.valor_adicional,
      totalMilla7: row.total_milla7,
      estado: row.estado,
      tipoValidacion: row.tipo_validacion,
      notasValidacion: row.notas_validacion,
      notas2: row.notas2
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error buscando detalles conciliacion LB:', err);
    res.status(500).json({ success: false, message: 'Error interno buscando detalles' });
  }
};
