import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';
import { pdfParse } from '../utils/pdfParser.js';

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

  // Sede del cliente (CAF = Caribbean American Freight / USA, M7 = Milla Siete / Colombia) —
  // determina formato de fecha/moneda al presentar información, nunca se segmentan las tablas
  // maestras en sí. Se infiere de la moneda para los clientes ya existentes.
  await pool.query(`ALTER TABLE fulfillment_clientes ADD COLUMN IF NOT EXISTS sede TEXT CHECK (sede IN ('CAF','M7'))`);
  await pool.query(`
    UPDATE fulfillment_clientes SET sede = CASE WHEN moneda = 'USD' THEN 'CAF' WHEN moneda = 'COP' THEN 'M7' ELSE sede END
    WHERE sede IS NULL
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
    INSERT INTO estados (id, name, status_id) VALUES
      ('EST-19', 'CONCILIADO', 'EST-01'),
      ('EST-22', 'PREAPROBADO', 'EST-01'),
      ('EST-23', 'APROBADO', 'EST-01')
    ON CONFLICT (id) DO NOTHING
  `);

  // Canal de origen del pedido (Shipstation, Website, Envia, Courier, Mensajero...) — siempre
  // informativo/interno, nunca parte de lo que ve el cliente.
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS nota TEXT`);
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS monto_final NUMERIC(14,2)`);
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS diferencia_monto NUMERIC(14,2)`);
  await pool.query(`UPDATE fulfillment_detalle SET diferencia_monto = (COALESCE(monto, 0) - monto_final) WHERE monto_final IS NOT NULL AND (diferencia_monto IS NULL OR diferencia_monto != (COALESCE(monto, 0) - monto_final))`);
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS factura_transportista TEXT`);
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS fecha_factura_transportista DATE`);
  await pool.query(`ALTER TABLE fulfillment_detalle ADD COLUMN IF NOT EXISTS estado_id TEXT DEFAULT 'EST-22' REFERENCES estados(id)`);
  await pool.query(`UPDATE fulfillment_detalle SET estado_id = 'EST-22' WHERE estado_id IS NULL`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fulfillment_reg_cliente ON fulfillment_registros (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_reg     ON fulfillment_detalle (registro_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_transp  ON fulfillment_detalle (transportista_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_prod    ON fulfillment_detalle (producto_servicio_id);
    CREATE INDEX IF NOT EXISTS idx_fulfillment_det_orden   ON fulfillment_detalle (orden);
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
  const { codigo, nombre, pais, moneda, notas_tarifas, sede } = req.body || {};
  if (!codigo?.trim() || !nombre?.trim()) return res.status(400).json({ success: false, error: 'Código y nombre son obligatorios.' });
  if (!['USD', 'COP'].includes(moneda)) return res.status(400).json({ success: false, error: 'La moneda debe ser USD o COP.' });
  if (sede && !['CAF', 'M7'].includes(sede)) return res.status(400).json({ success: false, error: 'La sede debe ser CAF o M7.' });
  try {
    const r = await pool.query(
      `INSERT INTO fulfillment_clientes (codigo, nombre, pais, moneda, notas_tarifas, sede, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [codigo.trim().toUpperCase(), nombre.trim(), pais?.trim() || null, moneda, notas_tarifas?.trim() || null, sede || (moneda === 'USD' ? 'CAF' : 'M7'), getUser(req)]
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
  const { nombre, pais, moneda, notas_tarifas, estado_id, sede } = req.body || {};
  if (sede && !['CAF', 'M7'].includes(sede)) return res.status(400).json({ success: false, error: 'La sede debe ser CAF o M7.' });
  try {
    const r = await pool.query(
      `UPDATE fulfillment_clientes SET
         nombre = COALESCE($1, nombre), pais = $2, moneda = COALESCE($3, moneda),
         notas_tarifas = $4, estado_id = COALESCE($5, estado_id), sede = COALESCE($6, sede),
         usuario_actualizacion = $7, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota')
       WHERE id = $8 RETURNING *`,
      [nombre?.trim() || null, pais?.trim() || null, moneda || null, notas_tarifas?.trim() || null, estado_id || null, sede || null, getUser(req), id]
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
    if (anio) { vals.push(anio); conds.push(`r.anio = $${vals.length}`); }
    if (mes) { vals.push(mes); conds.push(`r.mes = $${vals.length}`); }

    // Vista por defecto de "Consulta": solo el período (año+mes) más reciente que exista,
    // sin necesidad de que el usuario aplique filtros primero.
    if (latest === 'true' && !anio && !mes) {
      const latestPeriod = await resolveLatestPeriod(cliente_id);
      if (latestPeriod) {
        vals.push(latestPeriod.anio); conds.push(`r.anio = $${vals.length}`);
        vals.push(latestPeriod.mes); conds.push(`r.mes = $${vals.length}`);
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
        SELECT d.*, TO_CHAR(d.fecha, 'YYYY-MM-DD') AS fecha, p.nombre AS producto_servicio_nombre, t.nombre AS transportista_nombre, e.name AS estado_nombre
        FROM fulfillment_detalle d
        LEFT JOIN fulfillment_productos_servicios p ON p.id = d.producto_servicio_id
        LEFT JOIN fulfillment_transportistas t ON t.id = d.transportista_id
        LEFT JOIN estados e ON e.id = d.estado_id
        WHERE d.registro_id = $1
        ORDER BY d.fecha NULLS LAST, d.id
      `, [id]),
    ]);
    if (!reg.rows.length) return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    res.json({ success: true, registro: reg.rows[0], detalle: det.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

export const searchRegistroDetalleGlobal = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { busqueda, cliente_id } = req.query as Record<string, string>;
    if (!busqueda?.trim() || busqueda.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const rawTerm = busqueda.trim();
    const cleanTerm = `%${rawTerm.replace(/[\s\-]/g, '')}%`;
    const likeTerm = `%${rawTerm}%`;

    const conds: string[] = [
      `(
         REPLACE(REPLACE(COALESCE(d.seguimiento,''), '-', ''), ' ', '') ILIKE $1 OR
         REPLACE(REPLACE(COALESCE(d.orden,''), '-', ''), ' ', '') ILIKE $1 OR
         REPLACE(REPLACE(COALESCE(d.factura_transportista,''), '-', ''), ' ', '') ILIKE $1 OR
         d.descripcion ILIKE $2
       )`
    ];
    const vals: any[] = [cleanTerm, likeTerm];

    if (cliente_id) {
      vals.push(cliente_id);
      conds.push(`r.cliente_id = $${vals.length}`);
    }

    const r = await pool.query(`
      SELECT 
        d.*,
        TO_CHAR(d.fecha, 'YYYY-MM-DD') AS fecha,
        p.nombre AS producto_servicio_nombre,
        t.nombre AS transportista_nombre,
        COALESCE(e.name, d.estado_id) AS estado_nombre,
        r.id AS registro_id,
        r.anio,
        r.mes,
        r.subtipo,
        c.id AS cliente_id,
        c.nombre AS cliente_nombre,
        c.codigo AS cliente_codigo,
        c.moneda AS cliente_moneda
      FROM fulfillment_detalle d
      JOIN fulfillment_registros r ON r.id = d.registro_id
      JOIN fulfillment_clientes c ON c.id = r.cliente_id
      LEFT JOIN fulfillment_productos_servicios p ON p.id = d.producto_servicio_id
      LEFT JOIN fulfillment_transportistas t ON t.id = d.transportista_id
      LEFT JOIN estados e ON e.id = d.estado_id
      WHERE ${conds.join(' AND ')}
      ORDER BY r.anio DESC, ${MES_ORDEN_SQL} DESC, d.fecha DESC NULLS LAST
      LIMIT 100
    `, vals);

    res.json({ success: true, data: r.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
};

export const deleteRegistro = async (req: Request, res: Response) => {
  await ensureTables();
  try {
    const r = await pool.query(`DELETE FROM fulfillment_registros WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
};

// Crea el período (Cliente + Año + Mes + Subtipo) SIN ningún ítem — el primer ítem se agrega
// después desde "Ver Detalle". Distinto de createDetalleManual, que crea el registro implícito
// al agregar la primera línea; este endpoint es la vía explícita para armar el mes vacío primero.
export const createRegistroVacio = async (req: Request, res: Response) => {
  await ensureTables();
  const usuario = getUser(req);
  const { cliente_id, anio, mes, subtipo } = req.body || {};
  if (!cliente_id) return res.status(400).json({ success: false, error: 'El cliente es obligatorio.' });
  if (!anio || !mes) return res.status(400).json({ success: false, error: 'El año y el mes son obligatorios.' });
  try {
    const cliRes = await pool.query(`SELECT moneda FROM fulfillment_clientes WHERE id = $1`, [cliente_id]);
    if (!cliRes.rows.length) return res.status(404).json({ success: false, error: 'Cliente no encontrado.' });
    const r = await pool.query(
      `INSERT INTO fulfillment_registros (cliente_id, anio, mes, subtipo, moneda, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [cliente_id, anio, normName(mes), subtipo?.trim() || null, cliRes.rows[0].moneda, usuario]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe un registro para ese cliente, año, mes y subtipo.' });
    res.status(500).json({ success: false, error: e.message });
  }
};

// Edita el período de un registro ya existente (por si la facturación debe tomar otro nombre
// de subtipo y/o pasar a otro mes) — no toca las líneas de detalle ni sus totales.
export const updateRegistro = async (req: Request, res: Response) => {
  await ensureTables();
  const { id } = req.params;
  const { anio, mes, subtipo } = req.body || {};
  if (!anio || !mes) return res.status(400).json({ success: false, error: 'El año y el mes son obligatorios.' });
  try {
    const r = await pool.query(
      `UPDATE fulfillment_registros SET
         anio = $1, mes = $2, subtipo = $3,
         usuario_actualizacion = $4, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota')
       WHERE id = $5 RETURNING *`,
      [anio, normName(mes), subtipo?.trim() || null, getUser(req), id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'Ya existe otro registro para ese cliente, año, mes y subtipo.' });
    res.status(500).json({ success: false, error: e.message });
  }
};

// KPIs gerenciales — consolidado por moneda + top transportistas/productos.
export const getResumenGerencial = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { cliente_id, anio, mes, latest } = req.query as Record<string, string>;
    const conds: string[] = [];
    const vals: any[] = [];
    if (cliente_id) { vals.push(cliente_id); conds.push(`r.cliente_id = $${vals.length}`); }
    if (anio) { vals.push(anio); conds.push(`r.anio = $${vals.length}`); }
    if (mes) { vals.push(mes); conds.push(`r.mes = $${vals.length}`); }
    if (latest === 'true' && !anio && !mes) {
      const latestPeriod = await resolveLatestPeriod(cliente_id);
      if (latestPeriod) {
        vals.push(latestPeriod.anio); conds.push(`r.anio = $${vals.length}`);
        vals.push(latestPeriod.mes); conds.push(`r.mes = $${vals.length}`);
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
    costo_transportista, transportista, seguimiento, comprado_en, destinatario, nota,
    monto_final, factura_transportista, fecha_factura_transportista,
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

    const numMontoInicial = toNum(monto);
    const numMontoFinal = monto_final !== undefined && monto_final !== null && monto_final !== '' ? toNum(monto_final) : null;
    const numCostoTransp = costo_transportista !== undefined && costo_transportista !== null && costo_transportista !== '' ? toNum(costo_transportista) : null;
    const calcDiferencia = numMontoFinal !== null ? (numMontoInicial - numMontoFinal) : null;
    const textFactura = factura_transportista?.trim() || null;
    const textFechaFactura = fecha_factura_transportista || null;

    const hasAnyFinal = numMontoFinal !== null || textFactura !== null || textFechaFactura !== null;
    const hasAllFinal = numMontoFinal !== null && textFactura !== null && textFechaFactura !== null;

    if (hasAnyFinal && !hasAllFinal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Si diligencia la liquidación final (Monto Final, Factura Transportista o Fecha Factura), es obligatorio ingresar los 3 campos completos.' });
    }

    const estadoId = hasAllFinal ? 'EST-23' : 'EST-22';

    const detRes = await client.query(
      `INSERT INTO fulfillment_detalle
         (registro_id, fecha, producto_servicio_id, descripcion, orden, cantidad, tarifa, monto,
          costo_transportista, transportista_id, seguimiento, comprado_en, destinatario, nota,
          monto_final, diferencia_monto, factura_transportista, fecha_factura_transportista, estado_id, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        registroId, fecha || null, productoId, descripcion?.trim() || null, orden?.trim() || null,
        toNum(cantidad), toNum(tarifa), toNum(monto),
        numCostoTransp, transportistaId, seguimiento?.trim() || null, comprado_en?.trim() || null, destinatario?.trim() || null, nota?.trim() || null,
        numMontoFinal, calcDiferencia, textFactura, textFechaFactura, estadoId, usuario,
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

// Edita una línea de detalle ya creada (surgen adicionales que alteran el registro, o el cliente
// solicita corregirlo) — recalcula los totales del registro luego de guardar.
export const updateDetalleManual = async (req: Request, res: Response) => {
  await ensureTables();
  const usuario = getUser(req);
  const { id } = req.params;
  const {
    fecha, producto, descripcion, orden, cantidad, tarifa, monto,
    costo_transportista, transportista, seguimiento, comprado_en, destinatario, nota,
    monto_final, factura_transportista, fecha_factura_transportista,
  } = req.body || {};

  if (!producto?.trim()) return res.status(400).json({ success: false, error: 'El producto/servicio es obligatorio.' });
  if (monto === undefined || monto === null || monto === '') return res.status(400).json({ success: false, error: 'El monto es obligatorio.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const detRow = await client.query(`SELECT registro_id FROM fulfillment_detalle WHERE id = $1`, [id]);
    if (!detRow.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Línea no encontrada.' }); }
    const registroId = detRow.rows[0].registro_id;

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

    const numMontoInicial = toNum(monto);
    const numMontoFinal = monto_final !== undefined && monto_final !== null && monto_final !== '' ? toNum(monto_final) : null;
    const numCostoTransp = costo_transportista !== undefined && costo_transportista !== null && costo_transportista !== '' ? toNum(costo_transportista) : null;
    const calcDiferencia = numMontoFinal !== null ? (numMontoInicial - numMontoFinal) : null;
    const textFactura = factura_transportista?.trim() || null;
    const textFechaFactura = fecha_factura_transportista || null;

    const hasAnyFinal = numMontoFinal !== null || textFactura !== null || textFechaFactura !== null;
    const hasAllFinal = numMontoFinal !== null && textFactura !== null && textFechaFactura !== null;

    if (hasAnyFinal && !hasAllFinal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Si diligencia la liquidación final (Monto Final, Factura Transportista o Fecha Factura), es obligatorio ingresar los 3 campos completos.' });
    }

    const estadoId = hasAllFinal ? 'EST-23' : 'EST-22';

    const upd = await client.query(
      `UPDATE fulfillment_detalle SET
         fecha = $1, producto_servicio_id = $2, descripcion = $3, orden = $4, cantidad = $5, tarifa = $6, monto = $7,
         costo_transportista = $8, transportista_id = $9, seguimiento = $10, comprado_en = $11, destinatario = $12, nota = $13,
         monto_final = $14, diferencia_monto = $15, factura_transportista = $16, fecha_factura_transportista = $17, estado_id = $18
       WHERE id = $19 RETURNING *`,
      [
        fecha || null, productoId, descripcion?.trim() || null, orden?.trim() || null,
        toNum(cantidad), toNum(tarifa), toNum(monto),
        numCostoTransp, transportistaId, seguimiento?.trim() || null, comprado_en?.trim() || null, destinatario?.trim() || null, nota?.trim() || null,
        numMontoFinal, calcDiferencia, textFactura, textFechaFactura, estadoId, id,
      ]
    );

    await recalcRegistroTotales(client, registroId);
    await client.query(
      `UPDATE fulfillment_registros SET usuario_actualizacion = $1, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota') WHERE id = $2`,
      [usuario, registroId]
    );

    await client.query('COMMIT');
    res.json({ success: true, registroId, detalle: upd.rows[0] });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally { client.release(); }
};

// Elimina una línea individual (el cliente solicita cancelar esa operación puntual) — recalcula
// los totales del registro luego de borrar.
export const deleteDetalleManual = async (req: Request, res: Response) => {
  await ensureTables();
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`DELETE FROM fulfillment_detalle WHERE id = $1 RETURNING registro_id`, [id]);
    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Línea no encontrada.' }); }
    const registroId = r.rows[0].registro_id;
    await recalcRegistroTotales(client, registroId);
    await client.query(
      `UPDATE fulfillment_registros SET usuario_actualizacion = $1, fecha_actualizacion = (NOW() AT TIME ZONE 'America/Bogota') WHERE id = $2`,
      [getUser(req), registroId]
    );
    await client.query('COMMIT');
    res.json({ success: true });
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
    const fecha = excelDateToISO(row[0]);
    out.push({
      fecha, producto: producto || 'Sin clasificar', descripcion, orden: null,
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

export const getPlantillaConciliacionFulfillment = async (_req: Request, res: Response) => {
  const headers = ['GUIA / SEGUIMIENTO', 'MONTO TOTAL', 'FACTURA TRANSPORTISTA', 'FECHA FACTURA'];
  const ejemplo = [
    ['2-608-61692', 45000, 'SFX-746929', '2026-08-15'],
    ['548036655', 133554, 'SFX-746930', '2026-08-16'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplo]);
  ws['!cols'] = headers.map(() => ({ wch: 25 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Conciliacion_Generica');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_conciliacion_fulfillment.xlsx"');
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

          const mesIdx = MESES_ES.indexOf(parsed.mes);
          const monthNum = mesIdx >= 0 ? String(mesIdx + 1).padStart(2, '0') : '01';
          const fechaDefecto = l.fecha || `${parsed.anio}-${monthNum}-01`;

          await client.query(
            `INSERT INTO fulfillment_detalle
               (registro_id, fecha, producto_servicio_id, descripcion, orden, cantidad, tarifa, monto,
                costo_transportista, transportista_id, seguimiento, comprado_en, destinatario, usuario_creacion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              registroId, fechaDefecto, productoId, l.descripcion || null, l.orden, l.cantidad, l.tarifa, l.monto,
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
        error: `El archivo no corresponde a la plantilla de FULFILLMENT. ${motivo} Descarga la plantilla e intenta de nuevo.`,
      });
    }

    res.json({ success: true, hojasImportadas, lineasImportadas, detalle: resumenHojas });
  } catch (e: any) {
    console.error('[FULFILLMENT-IMPORT]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

// ══════════════════════════════ CONCILIACIÓN FULFILLMENT ══════════════════════════════

const parseFechaString = (str: string): string | null => {
  if (!str) return null;
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const engMatch = s.match(/([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(\d{4})/);
  if (engMatch) {
    const monthStr = engMatch[1].toLowerCase().slice(0, 3);
    const day = parseInt(engMatch[2], 10);
    const year = parseInt(engMatch[3], 10);
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    if (months[monthStr]) {
      return `${year}-${months[monthStr]}-${String(day).padStart(2, '0')}`;
    }
  }

  const slashMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    if (part1 > 12) {
      return `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
    } else {
      return `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
    }
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
};

export const getConciliacionRegistros = async (req: Request, res: Response) => {
  await ensureTables();
  try {
    const {
      factura_transportista,
      fecha_factura_transportista,
      referencia_factura,
      transportista_id,
      estado_id,
      cliente_id,
      anio,
      mes,
      busqueda
    } = req.query;

    let query = `
      SELECT 
        fd.id,
        fd.registro_id,
        fd.fecha,
        fd.orden,
        fd.seguimiento,
        fd.descripcion,
        fd.monto AS monto_inicial,
        fd.monto_final,
        fd.diferencia_monto,
        fd.factura_transportista,
        TO_CHAR(fd.fecha_factura_transportista, 'YYYY-MM-DD') AS fecha_factura_transportista,
        fd.estado_id,
        COALESCE(e.name, fd.estado_id) AS estado_nombre,
        fd.transportista_id,
        ft.nombre AS transportista_nombre,
        fr.cliente_id,
        fc.nombre AS cliente_nombre,
        fc.codigo AS cliente_codigo,
        fr.referencia_factura,
        fr.anio,
        fr.mes
      FROM fulfillment_detalle fd
      JOIN fulfillment_registros fr ON fr.id = fd.registro_id
      JOIN fulfillment_clientes fc ON fc.id = fr.cliente_id
      LEFT JOIN fulfillment_transportistas ft ON ft.id = fd.transportista_id
      LEFT JOIN estados e ON e.id = fd.estado_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    const hasAnyFilter = Boolean(
      factura_transportista ||
      fecha_factura_transportista ||
      referencia_factura ||
      transportista_id ||
      estado_id ||
      cliente_id ||
      anio ||
      mes ||
      busqueda
    );

    if (factura_transportista) {
      const cleanFactura = `%${String(factura_transportista).replace(/[\s\-]/g, '')}%`;
      query += ` AND REPLACE(REPLACE(COALESCE(fd.factura_transportista,''), '-', ''), ' ', '') ILIKE $${pIdx++}`;
      params.push(cleanFactura);
    }
    if (fecha_factura_transportista) {
      query += ` AND fd.fecha_factura_transportista = $${pIdx++}::date`;
      params.push(fecha_factura_transportista);
    }
    if (referencia_factura) {
      query += ` AND fr.referencia_factura ILIKE $${pIdx++}`;
      params.push(`%${referencia_factura}%`);
    }
    if (transportista_id) {
      query += ` AND fd.transportista_id = $${pIdx++}`;
      params.push(Number(transportista_id));
    }
    if (estado_id) {
      query += ` AND fd.estado_id = $${pIdx++}`;
      params.push(estado_id);
    }
    if (cliente_id) {
      query += ` AND fr.cliente_id = $${pIdx++}`;
      params.push(Number(cliente_id));
    }
    if (anio) {
      query += ` AND fr.anio = $${pIdx++}`;
      params.push(Number(anio));
    }
    if (mes) {
      query += ` AND fr.mes = $${pIdx++}`;
      params.push(mes);
    }
    if (busqueda) {
      const cleanBusqueda = `%${String(busqueda).replace(/[\s\-]/g, '')}%`;
      const likeBusqueda = `%${busqueda}%`;
      query += ` AND (
        REPLACE(REPLACE(COALESCE(fd.orden,''), '-', ''), ' ', '') ILIKE $${pIdx} OR 
        REPLACE(REPLACE(COALESCE(fd.seguimiento,''), '-', ''), ' ', '') ILIKE $${pIdx} OR 
        fd.descripcion ILIKE $${pIdx + 1}
      )`;
      params.push(cleanBusqueda, likeBusqueda);
      pIdx += 2;
    }

    if (!hasAnyFilter) {
      const latestPeriod = await resolveLatestPeriod();
      if (latestPeriod) {
        query += ` AND fr.anio = $${pIdx++} AND fr.mes = $${pIdx++}`;
        params.push(latestPeriod.anio, latestPeriod.mes);
      }
    }

    query += ` ORDER BY fd.id DESC LIMIT 500`;

    const result = await pool.query(query, params);
    res.json({ success: true, registros: result.rows });

  } catch (e: any) {
    console.error('[FULFILLMENT-CONCILIACION-GET]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

export const analizarArchivoConciliacion = async (req: Request, res: Response) => {
  await ensureTables();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha adjuntado ningún archivo.' });
    }

    const filename = (req.file.originalname || '').toLowerCase();
    const mimetype = (req.file.mimetype || '').toLowerCase();
    const isPdf = filename.endsWith('.pdf') || mimetype.includes('pdf');
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls') || mimetype.includes('excel') || mimetype.includes('spreadsheet');

    if (!isPdf && !isExcel) {
      return res.status(400).json({ success: false, error: 'Formato de archivo no soportado. Debe ser PDF o Excel (.xlsx, .xls).' });
    }

    const formato = (req.body.formato || 'FEDEX_USA').toUpperCase();
    let facturaTransportista = '';
    let fechaFacturaTransportista = '';
    let transportista = 'FEDEX USA';
    if (formato === 'FEDEX_COL') transportista = 'FEDEX COLOMBIA';
    else if (formato === 'GENERIC_EXCEL') transportista = 'TRANSPORTISTA EXCEL';
    const itemsFile: Array<{ tracking: string; amount: number | null; rowFactura?: string; rowFecha?: string }> = [];

    if (isPdf) {
      const parsedPdf = await pdfParse(req.file.buffer);
      const fullText: string = parsedPdf.text || '';

      const invMatch = fullText.match(/SFX-?\s*(\d{6,10})/i)
                    || fullText.match(/Invoice\s*Number[:\s\n]+([A-Z0-9\-]+)/i)
                    || fullText.match(/Factura[:\s\n]+([A-Z0-9\-]+)/i)
                    || fullText.match(/Invoice[:\s\n]+([A-Z0-9\-]+)/i);
      if (invMatch) {
        facturaTransportista = invMatch[0].toUpperCase().includes('SFX') && !invMatch[1].startsWith('SFX')
          ? `SFX-${invMatch[1].trim()}`
          : invMatch[1].trim();
      }

      const dateMatch = fullText.match(/Invoice\s*Date[:\s\n]+([A-Za-z]{3,9}\s*\d{1,2},?\s*\d{4})/i)
                     || fullText.match(/Fecha\s*Factura[:\s\n]+([\d\/\-]+)/i)
                     || fullText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
      if (dateMatch) {
        fechaFacturaTransportista = parseFechaString(dateMatch[1]) || '';
      }

      // Extraer números de guía (9 a 15 dígitos) de todas las páginas del PDF
      const genericTrackingRegex = /\b(\d{9,15})\b/g;
      let match: RegExpExecArray | null;
      const seen = new Set<string>();

      while ((match = genericTrackingRegex.exec(fullText)) !== null) {
        const tr = match[1];
        if (!seen.has(tr)) {
          seen.add(tr);

          const pos = match.index;
          const blockText = fullText.substring(pos, Math.min(fullText.length, pos + 1200));

          let amount: number | null = null;
          if (formato === 'FEDEX_COL') {
            const colMatch = blockText.match(/\$\s*([\d\.\,]+)/);
            if (colMatch) {
              const rawVal = colMatch[1].replace(/\./g, '').replace(',', '.');
              const pVal = parseFloat(rawVal);
              if (!isNaN(pVal)) amount = pVal;
            }
          } else {
            const amountMatch = blockText.match(/Shipment Total[\s\S]*?\$?\s*([\d,]+\.\d{2})/i)
                             || blockText.match(/Net Charge[\s\S]*?\$?\s*([\d,]+\.\d{2})/i)
                             || blockText.match(/Total[\s\S]*?\$?\s*([\d,]+\.\d{2})/i)
                             || blockText.match(/\$\s*([\d,]+\.\d{2})/);
            if (amountMatch) {
              amount = parseFloat(amountMatch[1].replace(/,/g, ''));
            }
          }
          itemsFile.push({ tracking: tr, amount });
        }
      }
    } else if (isExcel) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      for (const row of rows) {
        let tracking = '';
        let amount: number | null = null;
        let rowFactura = '';
        let rowFecha = '';

        for (const [key, val] of Object.entries(row)) {
          const k = key.toLowerCase().trim();
          const vStr = String(val).trim();

          if (k.includes('seguimiento') || k.includes('tracking') || k.includes('guia') || k.includes('orden')) {
            if (vStr && !tracking) tracking = vStr;
          }
          if (k.includes('monto') || k.includes('total') || k.includes('valor') || k.includes('costo') || k.includes('net charge')) {
            const parsedVal = parseFloat(vStr.replace(/[\$,]/g, ''));
            if (!isNaN(parsedVal) && amount === null) amount = parsedVal;
          }
          if (k.includes('factura') || k.includes('invoice')) {
            if (vStr && !rowFactura) rowFactura = vStr;
          }
          if (k.includes('fecha') || k.includes('date')) {
            if (vStr && !rowFecha) rowFecha = parseFechaString(vStr) || vStr;
          }
        }

        if (rowFactura && !facturaTransportista) facturaTransportista = rowFactura;
        if (rowFecha && !fechaFacturaTransportista) fechaFacturaTransportista = rowFecha;

        if (tracking) {
          itemsFile.push({ tracking, amount, rowFactura, rowFecha });
        }
      }
    }

    const coincidencias: any[] = [];
    const sinCoincidencia: any[] = [];
    const cleanItems = itemsFile.filter(it => Boolean(it.tracking));

    for (const item of cleanItems) {
      const cleanTrackParam = item.tracking.replace(/[\s\-]/g, '');
      const dbRes = await pool.query(
        `SELECT 
           fd.id,
           fd.orden,
           fd.seguimiento,
           fd.monto,
           fd.monto_final,
           fd.diferencia_monto,
           fd.factura_transportista,
           TO_CHAR(fd.fecha_factura_transportista, 'YYYY-MM-DD') AS fecha_factura_transportista,
           fd.estado_id,
           COALESCE(e.name, fd.estado_id) AS estado_nombre,
           fc.nombre AS cliente_nombre,
           ft.nombre AS transportista_nombre
         FROM fulfillment_detalle fd
         JOIN fulfillment_registros fr ON fr.id = fd.registro_id
         JOIN fulfillment_clientes fc ON fc.id = fr.cliente_id
         LEFT JOIN fulfillment_transportistas ft ON ft.id = fd.transportista_id
         LEFT JOIN estados e ON e.id = fd.estado_id
         WHERE REPLACE(REPLACE(COALESCE(fd.seguimiento,''), '-', ''), ' ', '') = $1
            OR REPLACE(REPLACE(COALESCE(fd.orden,''), '-', ''), ' ', '') = $1
            OR REPLACE(REPLACE(COALESCE(fd.seguimiento,''), '-', ''), ' ', '') ILIKE '%' || $1 || '%'
            OR REPLACE(REPLACE(COALESCE(fd.orden,''), '-', ''), ' ', '') ILIKE '%' || $1 || '%'
         LIMIT 1`,
        [cleanTrackParam]
      );

      if (dbRes.rows.length > 0) {
        const row = dbRes.rows[0];
        const montoInicial = Number(row.monto || 0);
        const montoFinalBD = row.monto_final !== null ? Number(row.monto_final) : null;
        const montoExtraido = item.amount !== null ? Number(item.amount) : null;

        const montoComparar = montoFinalBD !== null ? montoFinalBD : montoInicial;
        const montoFinalGuardar = montoExtraido !== null ? montoExtraido : montoComparar;
        const diferenciaCalculada = montoExtraido !== null ? (montoInicial - montoExtraido) : (montoFinalBD !== null ? (montoInicial - montoFinalBD) : 0);
        const isYaConciliado = row.estado_id === 'EST-19';

        coincidencias.push({
          id: row.id,
          detalle_id: row.id,
          orden: row.orden,
          seguimiento: row.seguimiento,
          cliente_nombre: row.cliente_nombre,
          transportista_nombre: row.transportista_nombre || transportista,
          monto_inicial: montoInicial,
          monto_final_bd: montoFinalBD,
          monto_extraido: montoExtraido,
          monto_final: montoFinalGuardar,
          diferencia_monto: Number(diferenciaCalculada.toFixed(2)),
          factura_transportista: item.rowFactura || facturaTransportista,
          fecha_factura_transportista: item.rowFecha || fechaFacturaTransportista,
          estado_actual_id: row.estado_id,
          estado_actual_nombre: row.estado_nombre,
          ya_conciliado: isYaConciliado
        });
      } else {
        sinCoincidencia.push({
          seguimiento_o_ref: item.tracking,
          monto_file: item.amount,
          motivo: 'No se encontró registro coincidente en BD'
        });
      }
    }

    res.json({
      success: true,
      facturaTransportista,
      fechaFacturaTransportista,
      transportista,
      coincidencias,
      sinCoincidencia
    });

  } catch (e: any) {
    console.error('[FULFILLMENT-CONCILIACION-ANALIZAR]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

export const confirmarConciliacion = async (req: Request, res: Response) => {
  await ensureTables();
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'No se enviaron ítems para conciliar.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;

    for (const item of items) {
      const { detalle_id, factura_transportista, fecha_factura_transportista, monto_final } = item;

      const query = `
        UPDATE fulfillment_detalle
        SET
          estado_id = 'EST-19',
          factura_transportista = COALESCE($1, factura_transportista),
          fecha_factura_transportista = CASE WHEN $2::text IS NOT NULL AND $2::text <> '' THEN $2::date ELSE fecha_factura_transportista END,
          monto_final = COALESCE($3::numeric, monto_final),
          diferencia_monto = CASE WHEN $3::numeric IS NOT NULL THEN (monto - $3::numeric) ELSE diferencia_monto END
        WHERE id = $4
      `;
      await client.query(query, [
        factura_transportista || null,
        fecha_factura_transportista || null,
        monto_final !== undefined && monto_final !== null ? monto_final : null,
        detalle_id
      ]);
      count++;
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      actualizados: count,
      message: `${count} registros conciliados exitosamente con estado CONCILIADO.`
    });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[CONFIRMAR-CONCILIACION-ERROR]', e);
    res.status(500).json({ success: false, error: e.message });
  } finally {
    client.release();
  }
};

