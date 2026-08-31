import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';

// ─── Garantizar tablas (memoizado — evita DDL concurrente / deadlocks bajo carga) ──
let ensureTablesPromise: Promise<void> | null = null;
const ensureTables = () => {
  if (!ensureTablesPromise) {
    ensureTablesPromise = ensureTablesImpl().catch(err => { ensureTablesPromise = null; throw err; });
  }
  return ensureTablesPromise;
};
const ensureTablesImpl = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fulfillment_clientes (
      id                SERIAL PRIMARY KEY,
      codigo            TEXT NOT NULL UNIQUE,
      nombre            TEXT NOT NULL,
      pais              TEXT,
      moneda            TEXT NOT NULL DEFAULT 'COP' CHECK (moneda IN ('USD','COP')),
      notas_tarifas     TEXT,
      estado_id         TEXT NOT NULL DEFAULT 'EST-01' REFERENCES estados(id),
      usuario_creacion  TEXT,
      fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      usuario_actualizacion TEXT,
      fecha_actualizacion   TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fulfillment_transportistas (
      id                SERIAL PRIMARY KEY,
      nombre            TEXT NOT NULL UNIQUE,
      estado_id         TEXT NOT NULL DEFAULT 'EST-01' REFERENCES estados(id),
      usuario_creacion  TEXT,
      fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fulfillment_productos_servicios (
      id                SERIAL PRIMARY KEY,
      nombre            TEXT NOT NULL UNIQUE,
      estado_id         TEXT NOT NULL DEFAULT 'EST-01' REFERENCES estados(id),
      usuario_creacion  TEXT,
      fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fulfillment_registros (
      id                      SERIAL PRIMARY KEY,
      cliente_id              INTEGER NOT NULL REFERENCES fulfillment_clientes(id) ON DELETE CASCADE,
      anio                    INTEGER NOT NULL,
      mes                     TEXT NOT NULL,
      subtipo                 TEXT,
      hoja_origen             TEXT,
      archivo_origen          TEXT,
      moneda                  TEXT NOT NULL,
      valor_total             NUMERIC(16,2) NOT NULL DEFAULT 0,
      costo_transporte_total  NUMERIC(16,2) NOT NULL DEFAULT 0,
      utilidad                NUMERIC(16,2) NOT NULL DEFAULT 0,
      num_lineas              INTEGER NOT NULL DEFAULT 0,
      referencia_factura      TEXT,
      tasa_cambio             NUMERIC(14,4),
      usuario_creacion        TEXT,
      fecha_creacion          TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      usuario_actualizacion   TEXT,
      fecha_actualizacion     TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_reg_periodo
      ON fulfillment_registros (cliente_id, anio, mes, COALESCE(subtipo, ''))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fulfillment_detalle (
      id                    SERIAL PRIMARY KEY,
      registro_id           INTEGER NOT NULL REFERENCES fulfillment_registros(id) ON DELETE CASCADE,
      fecha                 DATE,
      producto_servicio_id  INTEGER REFERENCES fulfillment_productos_servicios(id),
      descripcion           TEXT,
      orden                 TEXT,
      cantidad              NUMERIC(14,2) DEFAULT 0,
      tarifa                NUMERIC(14,2) DEFAULT 0,
      monto                 NUMERIC(14,2) DEFAULT 0,
      costo_transportista   NUMERIC(14,2),
      transportista_id      INTEGER REFERENCES fulfillment_transportistas(id),
      seguimiento           TEXT,
      comprado_en           TEXT,
      destinatario          TEXT,
      usuario_creacion      TEXT,
      fecha_creacion        TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fulfillment_reg_cliente ON fulfillment_registros (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_reg     ON fulfillment_detalle (registro_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_transp  ON fulfillment_detalle (transportista_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_prod    ON fulfillment_detalle (producto_servicio_id);
  `);
};

// Guarda el ID del usuario (no el nombre) en usuario_creacion/usuario_actualizacion — igual
// que el resto de módulos de la app (trazabilidad por id, no por texto libre).
const getUser = (req: Request): string => (req as any).user?.id || 'Sistema';

const MESES_ES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
// Expresión SQL CASE para ordenar cronológicamente por nombre de mes en español.
const MES_ORDEN_SQL = `CASE r.mes ${MESES_ES.map((m, i) => `WHEN '${m}' THEN ${i + 1}`).join(' ')} ELSE 0 END`;

// ══════════════════════════════ CLIENTES ═══════════════════════════════════

export const getClientes = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const r = await pool.query(`SELECT c.*, e.name AS estado FROM fulfillment_clientes c LEFT JOIN estados e ON e.id = c.estado_id ORDER BY c.nombre`);
    res.json({ success: true, data: r.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const createCliente = async (req: Request, res: Response) => {
  await ensureTables();
  const { codigo, nombre, pais, moneda, notas_tarifas } = req.body || {};
  if (!codigo?.trim() || !nombre?.trim()) return res.status(400).json({ success: false, error: 'Código y nombre son obligatorios.' });
  if (!['USD', 'COP'].includes(moneda)) return res.status(400).json({ success: false, error: 'La moneda debe ser USD o COP.' });
  try {
    const r = await pool.query(
      `INSERT INTO fulfillment_clientes (codigo, nombre, pais, moneda, notas_tarifas, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [codigo.trim().toUpperCase(), nombre.trim(), pais?.trim() || null, moneda, notas_tarifas?.trim() || null, getUser(req)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un cliente con ese código.' });
    res.status(500).json({ success: false, error: e.message });
  }
};

export const updateCliente = async (req: Request, res: Response) => {
  await ensureTables();
  const { id } = req.params;
  const { nombre, pais, moneda, notas_tarifas, estado_id } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE fulfillment_clientes SET
         nombre = COALESCE($1, nombre), pais = $2, moneda = COALESCE($3, moneda),
         notas_tarifas = $4, estado_id = COALESCE($5, estado_id),
         usuario_actualizacion = $6, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota')
       WHERE id = $7 RETURNING *`,
      [nombre?.trim() || null, pais?.trim() || null, moneda || null, notas_tarifas?.trim() || null, estado_id || null, getUser(req), id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// ══════════════════════════════ TRANSPORTISTAS ═════════════════════════════

export const getTransportistas = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const r = await pool.query(`SELECT t.*, e.name AS estado FROM fulfillment_transportistas t LEFT JOIN estados e ON e.id = t.estado_id ORDER BY t.nombre`);
    res.json({ success: true, data: r.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const createTransportista = async (req: Request, res: Response) => {
  await ensureTables();
  const { nombre } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
  try {
    const r = await pool.query(
      `INSERT INTO fulfillment_transportistas (nombre, usuario_creacion) VALUES ($1,$2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING *`,
      [nombre.trim().toUpperCase(), getUser(req)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// No se permite eliminar (rompería la trazabilidad del histórico ya importado) — solo editar
// el nombre y activar/inactivar.
export const updateTransportista = async (req: Request, res: Response) => {
  await ensureTables();
  const { nombre, estado_id } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE fulfillment_transportistas SET nombre = COALESCE($1, nombre), estado_id = COALESCE($2, estado_id) WHERE id = $3 RETURNING *`,
      [nombre?.trim() ? nombre.trim().toUpperCase() : null, estado_id || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Transportista no encontrado.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un transportista con ese nombre.' });
    res.status(500).json({ success: false, error: e.message });
  }
};

// ══════════════════════════════ PRODUCTOS / SERVICIOS ══════════════════════

export const getProductos = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const r = await pool.query(`SELECT p.*, e.name AS estado FROM fulfillment_productos_servicios p LEFT JOIN estados e ON e.id = p.estado_id ORDER BY p.nombre`);
    res.json({ success: true, data: r.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const createProducto = async (req: Request, res: Response) => {
  await ensureTables();
  const { nombre } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
  try {
    const r = await pool.query(
      `INSERT INTO fulfillment_productos_servicios (nombre, usuario_creacion) VALUES ($1,$2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING *`,
      [nombre.trim(), getUser(req)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// No se permite eliminar — solo editar el nombre y activar/inactivar.
export const updateProducto = async (req: Request, res: Response) => {
  await ensureTables();
  const { nombre, estado_id } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE fulfillment_productos_servicios SET nombre = COALESCE($1, nombre), estado_id = COALESCE($2, estado_id) WHERE id = $3 RETURNING *`,
      [nombre?.trim() || null, estado_id || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Producto/servicio no encontrado.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un producto/servicio con ese nombre.' });
    res.status(500).json({ success: false, error: e.message });
  }
};

// ══════════════════════════════ REGISTROS / DETALLE ════════════════════════

// Resuelve el período (año+mes) más reciente que exista — usado para la vista por defecto
// de "Consulta" (que abre mostrando solo el último mes, sin que el usuario tenga que filtrar).
const resolveLatestPeriod = async (clienteId?: string): Promise<{ anio: number; mes: string } | null> => {
  const conds = clienteId ? [`r.cliente_id = $1`] : [];
  const vals = clienteId ? [clienteId] : [];
  const r = await pool.query(`
    SELECT r.anio, r.mes FROM fulfillment_registros r
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    ORDER BY r.anio DESC, ${MES_ORDEN_SQL} DESC
    LIMIT 1
  `, vals);
  return r.rows.length ? r.rows[0] : null;
};

export const getRegistros = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { cliente_id, anio, mes, latest } = req.query as Record<string, string>;
    const conds: string[] = [];
    const vals: any[] = [];
    if (cliente_id) { vals.push(cliente_id); conds.push(`r.cliente_id = $${vals.length}`); }
    if (anio)       { vals.push(anio);       conds.push(`r.anio = $${vals.length}`); }
    if (mes)        { vals.push(mes);        conds.push(`r.mes = $${vals.length}`); }

    // Vista por defecto de "Consulta": solo el período (año+mes) más reciente que exista,
    // sin necesidad de que el usuario aplique filtros primero.
    if (latest === 'true' && !anio && !mes) {
      const latestPeriod = await resolveLatestPeriod(cliente_id);
      if (latestPeriod) {
        vals.push(latestPeriod.anio); conds.push(`r.anio = $${vals.length}`);
        vals.push(latestPeriod.mes);  conds.push(`r.mes = $${vals.length}`);
      }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(`
      SELECT r.*, c.nombre AS cliente_nombre, c.codigo AS cliente_codigo, c.moneda AS cliente_moneda
      FROM fulfillment_registros r
      JOIN fulfillment_clientes c ON c.id = r.cliente_id
      ${where}
      ORDER BY r.anio DESC, ${MES_ORDEN_SQL} DESC, c.nombre
      LIMIT 500
    `, vals);
    res.json({ success: true, data: r.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const getRegistroDetalle = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const [reg, det] = await Promise.all([
      pool.query(`
        SELECT r.*, c.nombre AS cliente_nombre, c.codigo AS cliente_codigo, c.moneda AS cliente_moneda
        FROM fulfillment_registros r JOIN fulfillment_clientes c ON c.id = r.cliente_id WHERE r.id = $1
      `, [id]),
      pool.query(`
        SELECT d.*, p.nombre AS producto_servicio_nombre, t.nombre AS transportista_nombre
        FROM fulfillment_detalle d
        LEFT JOIN fulfillment_productos_servicios p ON p.id = d.producto_servicio_id
        LEFT JOIN fulfillment_transportistas t ON t.id = d.transportista_id
        WHERE d.registro_id = $1
        ORDER BY d.fecha NULLS LAST, d.id
      `, [id]),
    ]);
    if (!reg.rows.length) return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    res.json({ success: true, registro: reg.rows[0], detalle: det.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const deleteRegistro = async (req: Request, res: Response) => {
  await ensureTables();
  try {
    const r = await pool.query(`DELETE FROM fulfillment_registros WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// KPIs gerenciales — consolidado por moneda + top transportistas/productos.
export const getResumenGerencial = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { cliente_id, anio, mes, latest } = req.query as Record<string, string>;
    const conds: string[] = [];
    const vals: any[] = [];
    if (cliente_id) { vals.push(cliente_id); conds.push(`r.cliente_id = $${vals.length}`); }
    if (anio)       { vals.push(anio);       conds.push(`r.anio = $${vals.length}`); }
    if (mes)        { vals.push(mes);        conds.push(`r.mes = $${vals.length}`); }
    if (latest === 'true' && !anio && !mes) {
      const latestPeriod = await resolveLatestPeriod(cliente_id);
      if (latestPeriod) {
        vals.push(latestPeriod.anio); conds.push(`r.anio = $${vals.length}`);
        vals.push(latestPeriod.mes);  conds.push(`r.mes = $${vals.length}`);
      }
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const porMoneda = await pool.query(`
      SELECT r.moneda,
        COALESCE(SUM(r.valor_total), 0) AS valor_total,
        COALESCE(SUM(r.costo_transporte_total), 0) AS costo_transporte_total,
        COALESCE(SUM(r.utilidad), 0) AS utilidad,
        COALESCE(SUM(r.num_lineas), 0) AS num_lineas,
        COUNT(DISTINCT r.cliente_id) AS num_clientes,
        COUNT(*) AS num_registros
      FROM fulfillment_registros r ${where}
      GROUP BY r.moneda
    `, vals);

    const topTransportistas = await pool.query(`
      SELECT t.nombre, COUNT(*) AS envios, COALESCE(SUM(d.costo_transportista), 0) AS costo_total
      FROM fulfillment_detalle d
      JOIN fulfillment_registros r ON r.id = d.registro_id
      JOIN fulfillment_transportistas t ON t.id = d.transportista_id
      ${where}
      GROUP BY t.nombre ORDER BY costo_total DESC LIMIT 8
    `, vals);

    const topProductos = await pool.query(`
      SELECT p.nombre, COUNT(*) AS lineas, COALESCE(SUM(d.monto), 0) AS monto_total
      FROM fulfillment_detalle d
      JOIN fulfillment_registros r ON r.id = d.registro_id
      JOIN fulfillment_productos_servicios p ON p.id = d.producto_servicio_id
      ${where}
      GROUP BY p.nombre ORDER BY monto_total DESC LIMIT 8
    `, vals);

    res.json({ success: true, porMoneda: porMoneda.rows, topTransportistas: topTransportistas.rows, topProductos: topProductos.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// Recalcula los totales del registro SUMANDO sus líneas de detalle actuales — así el registro
// siempre queda consistente con lo que realmente tiene, sea que las líneas vinieran de la
// importación masiva o de creación manual una a una (que se van acumulando, nunca se reemplazan).
const recalcRegistroTotales = async (client: any, registroId: number) => {
  await client.query(
    `UPDATE fulfillment_registros r SET
       valor_total = COALESCE((SELECT SUM(monto) FROM fulfillment_detalle WHERE registro_id = r.id), 0),
       costo_transporte_total = COALESCE((SELECT SUM(costo_transportista) FROM fulfillment_detalle WHERE registro_id = r.id), 0),
       num_lineas = COALESCE((SELECT COUNT(*) FROM fulfillment_detalle WHERE registro_id = r.id), 0)
     WHERE r.id = $1`,
    [registroId]
  );
  await client.query(`UPDATE fulfillment_registros SET utilidad = valor_total - costo_transporte_total WHERE id = $1`, [registroId]);
};

// Crea (o reutiliza) el registro del período y agrega UNA línea de detalle — sin tocar las
// líneas existentes. Pensado para captura manual, uno a uno, a diferencia de la importación
// masiva (que sí reemplaza el detalle completo de la hoja importada).
export const createDetalleManual = async (req: Request, res: Response) => {
  await ensureTables();
  const usuario = getUser(req);
  const {
    cliente_id, anio, mes, subtipo,
    fecha, producto, descripcion, orden, cantidad, tarifa, monto,
    costo_transportista, transportista, seguimiento, comprado_en, destinatario,
  } = req.body || {};

  if (!cliente_id) return res.status(400).json({ success: false, error: 'El cliente es obligatorio.' });
  if (!anio || !mes) return res.status(400).json({ success: false, error: 'El año y el mes son obligatorios.' });
  if (!producto?.trim()) return res.status(400).json({ success: false, error: 'El producto/servicio es obligatorio.' });
  if (monto === undefined || monto === null || monto === '') return res.status(400).json({ success: false, error: 'El monto es obligatorio.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cliRes = await client.query(`SELECT * FROM fulfillment_clientes WHERE id = $1`, [cliente_id]);
    if (!cliRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Cliente no encontrado.' }); }
    const cliente = cliRes.rows[0];
    const mesNorm = normName(mes);

    let regRes = await client.query(
      `SELECT id FROM fulfillment_registros WHERE cliente_id = $1 AND anio = $2 AND mes = $3 AND COALESCE(subtipo, '') = COALESCE($4, '')`,
      [cliente_id, anio, mesNorm, subtipo || null]
    );
    let registroId: number;
    if (regRes.rows.length) {
      registroId = regRes.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO fulfillment_registros (cliente_id, anio, mes, subtipo, moneda, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [cliente_id, anio, mesNorm, subtipo || null, cliente.moneda, usuario]
      );
      registroId = ins.rows[0].id;
    }

    const pRes = await client.query(
      `INSERT INTO fulfillment_productos_servicios (nombre, usuario_creacion) VALUES ($1,$2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
      [producto.trim(), usuario]
    );
    const productoId = pRes.rows[0].id;

    let transportistaId: number | null = null;
    if (transportista?.trim()) {
      const tRes = await client.query(
        `INSERT INTO fulfillment_transportistas (nombre, usuario_creacion) VALUES ($1,$2)
         ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
        [transportista.trim().toUpperCase(), usuario]
      );
      transportistaId = tRes.rows[0].id;
    }

    const detRes = await client.query(
      `INSERT INTO fulfillment_detalle
         (registro_id, fecha, producto_servicio_id, descripcion, orden, cantidad, tarifa, monto,
          costo_transportista, transportista_id, seguimiento, comprado_en, destinatario, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        registroId, fecha || null, productoId, descripcion?.trim() || null, orden?.trim() || null,
        toNum(cantidad), toNum(tarifa), toNum(monto),
        costo_transportista !== undefined && costo_transportista !== '' ? toNum(costo_transportista) : null,
        transportistaId, seguimiento?.trim() || null, comprado_en?.trim() || null, destinatario?.trim() || null, usuario,
      ]
    );

    await recalcRegistroTotales(client, registroId);
    await client.query(
      `UPDATE fulfillment_registros SET usuario_actualizacion = $1, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota') WHERE id = $2`,
      [usuario, registroId]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, registroId, detalle: detRes.rows[0] });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally { client.release(); }
};

// ══════════════════════════════ IMPORTACIÓN XLSX ════════════════════════════

const SHEET_SKIP = /^(QUOTE|TARIFAS)$/i;

function excelDateToISO(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}
function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function cellText(v: any): string { return v === null || v === undefined ? '' : String(v).trim(); }
function normName(v: string): string { return v.toUpperCase().trim().replace(/\s+/g, ' '); }

// Parsea "MARZO-26-ECOMMERCE" / "AGOSTO-25" → { mes, anio, subtipo }
function parseSheetName(sheetName: string): { mes: string; anio: number; subtipo: string | null } | null {
  const parts = sheetName.split('-');
  const mesRaw = normName(parts[0] || '');
  const mes = MESES_ES.find(m => m === mesRaw || mesRaw.startsWith(m.slice(0, 4)));
  if (!mes) return null;
  const anioRaw = parts[1] ? parseInt(parts[1], 10) : NaN;
  if (isNaN(anioRaw)) return null;
  const anio = anioRaw < 100 ? 2000 + anioRaw : anioRaw;
  const subtipo = parts.length > 2 ? parts.slice(2).join('-') : null;
  return { mes, anio, subtipo };
}

// Encuentra la fila de encabezado principal (contiene FECHA/DATE + PRODUCTO/SERVICE).
function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(c => normName(cellText(c)));
    const hasFecha = row.some(c => c === 'FECHA' || c === 'DATE');
    const hasProducto = row.some(c => c.startsWith('PRODUCTO') || c === 'SERVICE');
    if (hasFecha && hasProducto) return i;
  }
  return -1;
}

function colIndexMatching(header: string[], patterns: RegExp[]): number {
  for (let i = 0; i < header.length; i++) {
    if (patterns.some(p => p.test(header[i]))) return i;
  }
  return -1;
}

const COST_LABELS = /^(TARIFA|RATE|TRANSPORTISTA|CARRIER|SEGUIMIENTO|TRACKING|COMPRADO EN|COSTE CAF|COSTE M7)$/;
const CARRIER_TOKENS = /\b(UPS|FEDEX|DHL|USPS|SHIPAL|COORDINADORA|SERVIENTREGA|TCC|ENVIA|INTERRAPIDISIMO|AMERICAN)\b/i;
// Números de guía/tracking suelen tener muchos dígitos — un "costo" de flete con 9+ dígitos
// casi siempre es en realidad un número de seguimiento mal ubicado, no un valor monetario real.
const MAX_PLAUSIBLE_COST_DIGITS = 9;

interface ParsedLine {
  fecha: string | null; producto: string; descripcion: string; orden: string | null;
  cantidad: number; tarifa: number; monto: number;
  costoTransportista: number | null; transportista: string | null; seguimiento: string | null;
  compradoEn: string | null; destinatario: string | null;
}

// Algunas hojas (p.ej. sub-ledgers de "Duties & Taxes"/"Derechos Aduanales") no traen fila de
// encabezado — mantienen la MISMA convención posicional de columnas pero sin los rótulos de texto.
// Se detecta el transportista por nombre conocido en cualquier celda de la fila (columna >= 6),
// tomando la celda numérica inmediatamente anterior como su costo y la siguiente como seguimiento.
function parseSheetRowsFallback(rows: any[][]): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const row of rows) {
    if (!row || !row.length) continue;
    const producto = cellText(row[1]);
    const descripcion = cellText(row[2]);
    const monto = toNum(row[5]);
    const cantidad = toNum(row[3]);
    if (!producto && !descripcion && !monto && !cantidad) continue;
    if (/^TOTAL MES$/i.test(descripcion) || /^TOTAL MES$/i.test(producto)) continue;
    if (/^(PRODUCTO|SERVICE|FECHA|DATE)/.test(normName(producto))) continue; // eco de un encabezado repetido

    let transportista: string | null = null, costoTransportista: number | null = null, seguimiento: string | null = null;
    for (let j = 6; j < row.length; j++) {
      const t = cellText(row[j]);
      const m = t.match(CARRIER_TOKENS);
      if (m) {
        transportista = m[1].toUpperCase();
        const prev = row[j - 1];
        if (typeof prev === 'number' && prev > 0 && String(Math.round(prev)).length <= MAX_PLAUSIBLE_COST_DIGITS) costoTransportista = prev;
        const next = cellText(row[j + 1]);
        if (next && !CARRIER_TOKENS.test(next)) seguimiento = next;
        break;
      }
    }
    out.push({
      fecha: null, producto: producto || 'Sin clasificar', descripcion, orden: null,
      cantidad, tarifa: toNum(row[4]), monto, costoTransportista, transportista, seguimiento,
      compradoEn: null, destinatario: null,
    });
  }
  return out;
}

function parseSheetRows(rows: any[][]): ParsedLine[] {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return parseSheetRowsFallback(rows);
  const header = rows[headerIdx].map(c => normName(cellText(c)));

  const cFecha = colIndexMatching(header, [/^(FECHA|DATE)$/]);
  const cProducto = colIndexMatching(header, [/^PRODUCTO/, /^SERVICE$/]);
  const cDescripcion = colIndexMatching(header, [/^DESCRIPCION/, /^DESCRIPTION$/]);
  const cOrden = colIndexMatching(header, [/^ORDEN$/]);
  const cCantidad = colIndexMatching(header, [/^(CANTIDAD|QTY)$/]);
  const cTarifa = colIndexMatching(header, [/^(TARIFA|RATE)$/]);
  const cMonto = colIndexMatching(header, [/^(MONTO|AMOUNT)$/]);

  // El sub-encabezado del bloque de costo de flete suele caer en la MISMA fila que el primer
  // dato (no en headerIdx) — se busca en las primeras filas de datos, columna >= cMonto.
  let cCosteTarifa = -1, cTransportista = -1, cSeguimiento = -1, cCompradoEn = -1;
  for (let i = headerIdx; i < Math.min(rows.length, headerIdx + 5); i++) {
    const row = rows[i].map(c => normName(cellText(c)));
    for (let j = Math.max(cMonto + 1, 6); j < row.length; j++) {
      if (/^(TARIFA|RATE)$/.test(row[j]) && cCosteTarifa < 0) cCosteTarifa = j;
      if (/^(TRANSPORTISTA|CARRIER)$/.test(row[j]) && cTransportista < 0) cTransportista = j;
      if (/^(SEGUIMIENTO|TRACKING)$/.test(row[j]) && cSeguimiento < 0) cSeguimiento = j;
      if (/^COMPRADO EN$/.test(row[j]) && cCompradoEn < 0) cCompradoEn = j;
    }
    if (cTransportista >= 0) break;
  }
  const cDestinatario = cCompradoEn >= 0 ? cCompradoEn + 1 : -1;

  const out: ParsedLine[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const producto = cellText(row[cProducto]);
    const descripcion = cDescripcion >= 0 ? cellText(row[cDescripcion]) : '';
    const monto = cMonto >= 0 ? toNum(row[cMonto]) : 0;
    const cantidad = cCantidad >= 0 ? toNum(row[cCantidad]) : 0;
    if (!producto && !descripcion && !monto && !cantidad) continue; // fila en blanco
    if (/^(PRODUCTO|SERVICE|FECHA|DATE)/.test(normName(producto))) continue; // eco de un encabezado repetido

    const transportistaRaw = cTransportista >= 0 ? cellText(row[cTransportista]) : '';
    const transportista = transportistaRaw && !COST_LABELS.test(normName(transportistaRaw)) ? transportistaRaw : null;
    const costeTarifaRaw = cCosteTarifa >= 0 ? row[cCosteTarifa] : null;
    const costoTransportista = costeTarifaRaw !== null && costeTarifaRaw !== '' && !COST_LABELS.test(normName(cellText(costeTarifaRaw)))
      ? toNum(costeTarifaRaw) : null;
    const seguimientoRaw = cSeguimiento >= 0 ? cellText(row[cSeguimiento]) : '';
    const seguimiento = seguimientoRaw && !COST_LABELS.test(normName(seguimientoRaw)) ? seguimientoRaw : null;
    const compradoEnRaw = cCompradoEn >= 0 ? cellText(row[cCompradoEn]) : '';
    const compradoEn = compradoEnRaw && !COST_LABELS.test(normName(compradoEnRaw)) ? compradoEnRaw : null;
    const destinatarioRaw = cDestinatario >= 0 ? cellText(row[cDestinatario]) : '';
    const destinatario = destinatarioRaw && !COST_LABELS.test(normName(destinatarioRaw)) ? destinatarioRaw : null;

    out.push({
      fecha: cFecha >= 0 ? excelDateToISO(row[cFecha]) : null,
      producto: producto || 'Sin clasificar',
      descripcion,
      orden: cOrden >= 0 ? (cellText(row[cOrden]) || null) : null,
      cantidad, tarifa: cTarifa >= 0 ? toNum(row[cTarifa]) : 0, monto,
      costoTransportista, transportista, seguimiento, compradoEn, destinatario,
    });
  }
  return out;
}

// Busca en las primeras filas alguna celda que parezca una referencia de factura.
function findInvoiceRef(rows: any[][], headerIdx: number): string | null {
  for (let i = 0; i < headerIdx; i++) {
    for (const cell of (rows[i] || [])) {
      const t = cellText(cell);
      if (/invoice|factura|fbt\d|ftt\d/i.test(t)) return t;
    }
  }
  return null;
}

// Plantilla descargable con la estructura exacta que reconoce el parser: nombre de hoja
// "MES-AA[-SUBTIPO]" y encabezados FECHA/PRODUCTO-SERVICIO/.../MONTO + bloque de costo de flete.
export const getPlantillaFulfillment = async (_req: Request, res: Response) => {
  const headers = [
    'FECHA', 'PRODUCTO/SERVICIO', 'DESCRIPCION', 'ORDEN', 'CANTIDAD', 'TARIFA', 'MONTO',
    'TARIFA', 'TRANSPORTISTA', 'SEGUIMIENTO', 'COMPRADO EN', 'DESTINATARIO',
  ];
  const ejemplo = [
    ['2026-01-15', 'Envío Nacional', 'Caja 1kg', 'ORD-0001', 1, 12000, 35000, 8000, 'SERVIENTREGA', '123456789', 'Bodega Principal', 'Juan Pérez'],
    ['2026-01-16', 'Etiquetado', 'Etiqueta personalizada', 'ORD-0002', 2, 3000, 6000, '', '', '', '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplo]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  // El nombre de la hoja es lo primero que valida el importador: MES-AA (ej: ENERO-26) o
  // MES-AA-SUBTIPO (ej: ENERO-26-ECOMMERCE) si se maneja más de un tipo de operación por mes.
  XLSX.utils.book_append_sheet(wb, ws, 'ENERO-26');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_fullfilment.xlsx"');
  res.send(buf);
};

export const importFulfillmentXlsx = async (req: Request, res: Response) => {
  await ensureTables();
  const { cliente_id } = req.body || {};
  if (!req.file) return res.status(400).json({ success: false, error: 'Se requiere un archivo Excel (.xlsx)' });
  if (!cliente_id) return res.status(400).json({ success: false, error: 'Debes indicar el cliente.' });

  const usuario = getUser(req);
  try {
    const cliRes = await pool.query(`SELECT * FROM fulfillment_clientes WHERE id = $1`, [cliente_id]);
    if (!cliRes.rows.length) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    const cliente = cliRes.rows[0];

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const resumenHojas: any[] = [];
    let hojasImportadas = 0, lineasImportadas = 0;
    let hojaSinNombreValido = false, hojaSinDatosValidos = false;

    const confCache = new Map<string, number>();
    const prodCache = new Map<string, number>();

    for (const sheetName of wb.SheetNames) {
      if (SHEET_SKIP.test(sheetName)) continue;
      const parsed = parseSheetName(sheetName);
      if (!parsed) { hojaSinNombreValido = true; continue; }

      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][];
      const lineas = parseSheetRows(rows);
      if (!lineas.length) { hojaSinDatosValidos = true; continue; }
      const headerIdx = findHeaderRow(rows);
      const referenciaFactura = findInvoiceRef(rows, headerIdx >= 0 ? headerIdx : 3);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const valorTotal = lineas.reduce((s, l) => s + l.monto, 0);
        const costoTotal = lineas.reduce((s, l) => s + (l.costoTransportista || 0), 0);

        const regRes = await client.query(
          `INSERT INTO fulfillment_registros
             (cliente_id, anio, mes, subtipo, hoja_origen, archivo_origen, moneda,
              valor_total, costo_transporte_total, utilidad, num_lineas, referencia_factura, usuario_creacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (cliente_id, anio, mes, COALESCE(subtipo, '')) DO UPDATE SET
             valor_total = EXCLUDED.valor_total, costo_transporte_total = EXCLUDED.costo_transporte_total,
             utilidad = EXCLUDED.utilidad, num_lineas = EXCLUDED.num_lineas,
             referencia_factura = EXCLUDED.referencia_factura, hoja_origen = EXCLUDED.hoja_origen,
             archivo_origen = EXCLUDED.archivo_origen,
             usuario_actualizacion = $13, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota')
           RETURNING id`,
          [
            cliente_id, parsed.anio, parsed.mes, parsed.subtipo, sheetName, req.file!.originalname, cliente.moneda,
            valorTotal, costoTotal, valorTotal - costoTotal, lineas.length, referenciaFactura, usuario,
          ]
        );
        const registroId = regRes.rows[0].id;

        // Reemplaza el detalle completo de este período en cada (re)importación.
        await client.query(`DELETE FROM fulfillment_detalle WHERE registro_id = $1`, [registroId]);

        for (const l of lineas) {
          const prodKey = normName(l.producto);
          let productoId = prodCache.get(prodKey);
          if (!productoId) {
            const pRes = await client.query(
              `INSERT INTO fulfillment_productos_servicios (nombre, usuario_creacion) VALUES ($1,$2)
               ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
              [l.producto, usuario]
            );
            productoId = pRes.rows[0].id;
            prodCache.set(prodKey, productoId!);
          }

          let transportistaId: number | null = null;
          if (l.transportista) {
            const tKey = normName(l.transportista);
            transportistaId = confCache.get(tKey) || null;
            if (!transportistaId) {
              const tRes = await client.query(
                `INSERT INTO fulfillment_transportistas (nombre, usuario_creacion) VALUES ($1,$2)
                 ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
                [l.transportista.trim().toUpperCase(), usuario]
              );
              transportistaId = tRes.rows[0].id;
              confCache.set(tKey, transportistaId!);
            }
          }

          await client.query(
            `INSERT INTO fulfillment_detalle
               (registro_id, fecha, producto_servicio_id, descripcion, orden, cantidad, tarifa, monto,
                costo_transportista, transportista_id, seguimiento, comprado_en, destinatario, usuario_creacion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              registroId, l.fecha, productoId, l.descripcion || null, l.orden, l.cantidad, l.tarifa, l.monto,
              l.costoTransportista, transportistaId, l.seguimiento, l.compradoEn, l.destinatario, usuario,
            ]
          );
        }

        await client.query('COMMIT');
        hojasImportadas++;
        lineasImportadas += lineas.length;
        resumenHojas.push({ hoja: sheetName, mes: parsed.mes, anio: parsed.anio, subtipo: parsed.subtipo, lineas: lineas.length, valorTotal });
      } catch (e: any) {
        await client.query('ROLLBACK');
        resumenHojas.push({ hoja: sheetName, error: e.message });
      } finally {
        client.release();
      }
    }

    if (hojasImportadas === 0) {
      const motivo = hojaSinNombreValido
        ? 'El nombre de las hojas no coincide con el formato esperado (ej: ENERO-26 o ENERO-26-ECOMMERCE).'
        : hojaSinDatosValidos
          ? 'No se encontraron encabezados FECHA y PRODUCTO/SERVICIO ni datos reconocibles en las hojas.'
          : 'El archivo no tiene hojas para importar.';
      return res.status(400).json({
        success: false,
        error: `El archivo no corresponde a la plantilla de Fullfilment. ${motivo} Descarga la plantilla e intenta de nuevo.`,
      });
    }

    res.json({ success: true, hojasImportadas, lineasImportadas, detalle: resumenHojas });
  } catch (e: any) {
    console.error('[FULFILLMENT-IMPORT]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};
