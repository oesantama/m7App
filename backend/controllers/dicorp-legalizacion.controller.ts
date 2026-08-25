import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';

// Estados del catálogo compartido `estados` usados por la legalización Dicorp.
const ESTADO_PENDIENTE_ID = 'EST-03';   // ya existe en el catálogo (name = 'PENDIENTE')
const ESTADO_LEGALIZADO_ID = 'EST-18';  // agregado por este módulo (name = 'LEGALIZADO')
// Catálogo compartido `master_records` (mismo mecanismo genérico de maestros de toda la app).
const METODO_PAGO_DEFAULT_ID = 'MPAGO-CONSIGNACION';

// ─── Garantizar tablas en primera llamada ─────────────────────────────────────
const ensureTables = async () => {
  // Estado propio del módulo dentro del catálogo compartido `estados` (id con formato EST-XX).
  await pool.query(`
    INSERT INTO estados (id, name, status_id) VALUES ($1, 'LEGALIZADO', 'EST-01')
    ON CONFLICT (id) DO NOTHING
  `, [ESTADO_LEGALIZADO_ID]);

  // Semilla del catálogo de bancos y métodos de pago (tabla genérica master_records, category='bancos'/'metodos_pago').
  await pool.query(`
    INSERT INTO master_records (id, category, name, status_id, created_by) VALUES
      ('BANCO-BANCOLOMBIA', 'bancos', 'BANCOLOMBIA', 'EST-01', 'System'),
      ('BANCO-DAVIVIENDA', 'bancos', 'DAVIVIENDA', 'EST-01', 'System'),
      ('BANCO-DE-BOGOTA', 'bancos', 'BANCO DE BOGOTA', 'EST-01', 'System'),
      ('BANCO-BBVA', 'bancos', 'BBVA', 'EST-01', 'System'),
      ('BANCO-DE-OCCIDENTE', 'bancos', 'BANCO DE OCCIDENTE', 'EST-01', 'System'),
      ('BANCO-AV-VILLAS', 'bancos', 'BANCO AV VILLAS', 'EST-01', 'System'),
      ('BANCO-CAJA-SOCIAL', 'bancos', 'BANCO CAJA SOCIAL', 'EST-01', 'System'),
      ('BANCO-NEQUI', 'bancos', 'NEQUI', 'EST-01', 'System'),
      ('BANCO-DAVIPLATA', 'bancos', 'DAVIPLATA', 'EST-01', 'System'),
      ('MPAGO-CONSIGNACION', 'metodos_pago', 'CONSIGNACION', 'EST-01', 'System'),
      ('MPAGO-TRANSFERENCIA', 'metodos_pago', 'TRANSFERENCIA', 'EST-01', 'System')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_legalizacion_encabezado (
      id                  SERIAL PRIMARY KEY,
      cargue_numero       TEXT NOT NULL,
      fecha               DATE NOT NULL,
      placa               TEXT NOT NULL,
      conductor_cedula    TEXT,
      conductor_nombre    TEXT NOT NULL,
      transportador       TEXT DEFAULT 'MILLA SIETE S.A.S',
      valor_total         NUMERIC DEFAULT 0,
      kilos_total         NUMERIC DEFAULT 0,
      pedidos_total       INTEGER DEFAULT 0,
      estado_id           TEXT NOT NULL DEFAULT 'EST-03',
      uploaded_by         TEXT,
      uploaded_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  // Columnas financieras planas de la versión anterior — superadas por las tablas de pagos separadas.
  await pool.query(`
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS banco;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS comprobante;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS valor_consignado;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS fecha_consignacion;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS valor_devolucion;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS valor_sobrecosto;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS tipo_sobrecosto;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS observaciones;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS legalizado_por;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS legalizado_at;
    -- Redundante con cargue_numero (nunca se pobló distinto) — el "planilla" a nivel de encabezado ES el cargue.
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS no_planilla;
    ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN IF EXISTS numero_factura_sap;
  `);
  // Clasificación del descuadre — se registra únicamente al CERRAR la placa del día, si queda saldo pendiente.
  await pool.query(`
    ALTER TABLE dicorp_legalizacion_encabezado ADD COLUMN IF NOT EXISTS tipo_descuadre TEXT;
    ALTER TABLE dicorp_legalizacion_encabezado ADD COLUMN IF NOT EXISTS comentario_descuadre TEXT;
    ALTER TABLE dicorp_legalizacion_encabezado ADD COLUMN IF NOT EXISTS cerrado_por TEXT;
    ALTER TABLE dicorp_legalizacion_encabezado ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMP WITH TIME ZONE;
  `);
  // Migración: estado (texto libre) → estado_id (FK a estados).
  await pool.query(`
    DO $mig$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'dicorp_legalizacion_encabezado' AND column_name = 'estado_id') THEN
        ALTER TABLE dicorp_legalizacion_encabezado ADD COLUMN estado_id TEXT;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'dicorp_legalizacion_encabezado' AND column_name = 'estado') THEN
        UPDATE dicorp_legalizacion_encabezado
          SET estado_id = CASE estado WHEN 'LEGALIZADO' THEN 'EST-18' ELSE 'EST-03' END
          WHERE estado_id IS NULL;
        ALTER TABLE dicorp_legalizacion_encabezado DROP COLUMN estado;
      END IF;

      UPDATE dicorp_legalizacion_encabezado SET estado_id = 'EST-03' WHERE estado_id IS NULL;
      ALTER TABLE dicorp_legalizacion_encabezado ALTER COLUMN estado_id SET DEFAULT 'EST-03';
      ALTER TABLE dicorp_legalizacion_encabezado ALTER COLUMN estado_id SET NOT NULL;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dicorp_enc_estado') THEN
        ALTER TABLE dicorp_legalizacion_encabezado
          ADD CONSTRAINT fk_dicorp_enc_estado FOREIGN KEY (estado_id) REFERENCES estados(id);
      END IF;
    END $mig$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dicorp_enc_fecha_cargue
      ON dicorp_legalizacion_encabezado (fecha, cargue_numero)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_clientes (
      codigo_cliente  TEXT PRIMARY KEY,
      nombre_cliente  TEXT NOT NULL,
      direccion       TEXT,
      centro          TEXT,
      nombre_centro   TEXT,
      ciudad          TEXT,
      barrio          TEXT,
      telefono        TEXT,
      vendedor        TEXT,
      canal           TEXT,
      origen          TEXT,
      updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_legalizacion_detalle (
      id              SERIAL PRIMARY KEY,
      id_encabezado   INTEGER NOT NULL REFERENCES dicorp_legalizacion_encabezado(id) ON DELETE CASCADE,
      pedido_sap      TEXT NOT NULL UNIQUE,
      factura_sap     TEXT,
      codigo_cliente  TEXT REFERENCES dicorp_clientes(codigo_cliente),
      kilos           NUMERIC DEFAULT 0,
      unidades        INTEGER DEFAULT 0,
      valor_antes_iva NUMERIC DEFAULT 0,
      iva             NUMERIC DEFAULT 0,
      valor           NUMERIC DEFAULT 0
    )
  `);

  // ── Pagos INDIVIDUALES: una consignación/transferencia amarrada a UN pedido (factura) puntual ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_pagos_individuales (
      id             SERIAL PRIMARY KEY,
      id_detalle     INTEGER NOT NULL REFERENCES dicorp_legalizacion_detalle(id) ON DELETE CASCADE,
      placa          TEXT NOT NULL,
      banco          TEXT,
      comprobante    TEXT NOT NULL,
      valor          NUMERIC NOT NULL DEFAULT 0,
      fecha_pago     DATE,
      metodo_pago    TEXT DEFAULT 'CONSIGNACION',
      observacion    TEXT,
      usuario        TEXT,
      created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE dicorp_pagos_individuales ADD COLUMN IF NOT EXISTS id_detalle INTEGER REFERENCES dicorp_legalizacion_detalle(id) ON DELETE CASCADE;
  `);
  await pool.query(`DELETE FROM dicorp_pagos_individuales WHERE id_detalle IS NULL`);
  await pool.query(`ALTER TABLE dicorp_pagos_individuales ALTER COLUMN id_detalle SET NOT NULL`);
  await pool.query(`
    ALTER TABLE dicorp_pagos_individuales DROP COLUMN IF EXISTS id_encabezado;
  `);
  // Anulación (con motivo obligatorio) — se conserva el histórico, nunca se borra el registro.
  await pool.query(`
    ALTER TABLE dicorp_pagos_individuales ADD COLUMN IF NOT EXISTS anulado        BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE dicorp_pagos_individuales ADD COLUMN IF NOT EXISTS anulado_motivo TEXT;
    ALTER TABLE dicorp_pagos_individuales ADD COLUMN IF NOT EXISTS anulado_por    TEXT;
    ALTER TABLE dicorp_pagos_individuales ADD COLUMN IF NOT EXISTS anulado_at     TIMESTAMP WITH TIME ZONE;
  `);

  // ── Pagos GRUPALES: una consignación de la placa que cubre varios cargues acumulados ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_pagos_grupales (
      id             SERIAL PRIMARY KEY,
      placa          TEXT NOT NULL,
      banco          TEXT,
      comprobante    TEXT NOT NULL,
      valor          NUMERIC NOT NULL DEFAULT 0,
      fecha_pago     DATE,
      metodo_pago    TEXT DEFAULT 'CONSIGNACION',
      observacion    TEXT,
      usuario        TEXT,
      created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE dicorp_pagos_grupales ADD COLUMN IF NOT EXISTS anulado        BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE dicorp_pagos_grupales ADD COLUMN IF NOT EXISTS anulado_motivo TEXT;
    ALTER TABLE dicorp_pagos_grupales ADD COLUMN IF NOT EXISTS anulado_por    TEXT;
    ALTER TABLE dicorp_pagos_grupales ADD COLUMN IF NOT EXISTS anulado_at     TIMESTAMP WITH TIME ZONE;
  `);

  // Migración: banco/metodo_pago (texto libre) → banco_id/metodo_pago_id (FK a master_records).
  // Los valores ya cargados se emparejan por nombre contra el catálogo; si no hay match se crea la entrada.
  await pool.query(`
    DO $migbm$
    DECLARE
      tbl TEXT;
    BEGIN
      FOREACH tbl IN ARRAY ARRAY['dicorp_pagos_individuales', 'dicorp_pagos_grupales'] LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'banco_id') THEN
          EXECUTE format('ALTER TABLE %I ADD COLUMN banco_id TEXT', tbl);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'banco') THEN
          EXECUTE format($f$
            INSERT INTO master_records (id, category, name, status_id, created_by)
            SELECT DISTINCT 'BANCO-' || UPPER(REGEXP_REPLACE(TRIM(banco), '[^A-Za-z0-9]+', '-', 'g')),
                   'bancos', UPPER(TRIM(banco)), 'EST-01', 'System'
            FROM %I WHERE banco IS NOT NULL AND TRIM(banco) <> ''
            ON CONFLICT (id) DO NOTHING
          $f$, tbl);
          EXECUTE format($f$
            UPDATE %I t SET banco_id = mr.id
            FROM master_records mr
            WHERE mr.category = 'bancos' AND UPPER(mr.name) = UPPER(TRIM(t.banco))
              AND t.banco_id IS NULL AND t.banco IS NOT NULL
          $f$, tbl);
          EXECUTE format('ALTER TABLE %I DROP COLUMN banco', tbl);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'metodo_pago_id') THEN
          EXECUTE format('ALTER TABLE %I ADD COLUMN metodo_pago_id TEXT', tbl);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'metodo_pago') THEN
          EXECUTE format($f$
            INSERT INTO master_records (id, category, name, status_id, created_by)
            SELECT DISTINCT 'MPAGO-' || UPPER(REGEXP_REPLACE(TRIM(metodo_pago), '[^A-Za-z0-9]+', '-', 'g')),
                   'metodos_pago', UPPER(TRIM(metodo_pago)), 'EST-01', 'System'
            FROM %I WHERE metodo_pago IS NOT NULL AND TRIM(metodo_pago) <> ''
            ON CONFLICT (id) DO NOTHING
          $f$, tbl);
          EXECUTE format($f$
            UPDATE %I t SET metodo_pago_id = mr.id
            FROM master_records mr
            WHERE mr.category = 'metodos_pago' AND UPPER(mr.name) = UPPER(TRIM(t.metodo_pago))
              AND t.metodo_pago_id IS NULL AND t.metodo_pago IS NOT NULL
          $f$, tbl);
          EXECUTE format('ALTER TABLE %I DROP COLUMN metodo_pago', tbl);
        END IF;
        EXECUTE format('UPDATE %I SET metodo_pago_id = $1 WHERE metodo_pago_id IS NULL', tbl) USING '${METODO_PAGO_DEFAULT_ID}';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || tbl || '_banco') THEN
          EXECUTE format('ALTER TABLE %I ADD CONSTRAINT fk_%s_banco FOREIGN KEY (banco_id) REFERENCES master_records(id)', tbl, tbl);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || tbl || '_metodo_pago') THEN
          EXECUTE format('ALTER TABLE %I ADD CONSTRAINT fk_%s_metodo_pago FOREIGN KEY (metodo_pago_id) REFERENCES master_records(id)', tbl, tbl);
        END IF;
      END LOOP;
    END $migbm$;
  `);

  // ── Devoluciones: valor general de mercancía/dinero devuelto por la placa (no atado a un cargue) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_devoluciones (
      id             SERIAL PRIMARY KEY,
      placa          TEXT NOT NULL,
      valor          NUMERIC NOT NULL DEFAULT 0,
      fecha          DATE,
      observacion    TEXT,
      usuario        TEXT,
      created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE dicorp_devoluciones ADD COLUMN IF NOT EXISTS anulado        BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE dicorp_devoluciones ADD COLUMN IF NOT EXISTS anulado_motivo TEXT;
    ALTER TABLE dicorp_devoluciones ADD COLUMN IF NOT EXISTS anulado_por    TEXT;
    ALTER TABLE dicorp_devoluciones ADD COLUMN IF NOT EXISTS anulado_at     TIMESTAMP WITH TIME ZONE;
  `);

  // ── Sobrecostos: por placa, opcionalmente referenciando un cargue, con flujo de aprobación ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_sobrecostos (
      id             SERIAL PRIMARY KEY,
      placa          TEXT NOT NULL,
      id_encabezado  INTEGER REFERENCES dicorp_legalizacion_encabezado(id) ON DELETE SET NULL,
      valor          NUMERIC NOT NULL DEFAULT 0,
      referencia     TEXT,
      fecha          DATE,
      tipo           TEXT DEFAULT 'EFECTIVO',
      status         TEXT NOT NULL DEFAULT 'PENDIENTE',
      observaciones  TEXT,
      usuario        TEXT,
      created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE dicorp_sobrecostos ADD COLUMN IF NOT EXISTS anulado        BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE dicorp_sobrecostos ADD COLUMN IF NOT EXISTS anulado_motivo TEXT;
    ALTER TABLE dicorp_sobrecostos ADD COLUMN IF NOT EXISTS anulado_por    TEXT;
    ALTER TABLE dicorp_sobrecostos ADD COLUMN IF NOT EXISTS anulado_at     TIMESTAMP WITH TIME ZONE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dicorp_legalizacion_log (
      id             SERIAL PRIMARY KEY,
      id_encabezado  INTEGER REFERENCES dicorp_legalizacion_encabezado(id) ON DELETE CASCADE,
      accion         TEXT NOT NULL,
      observacion    TEXT,
      usuario        TEXT,
      fecha          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dicorp_enc_estado     ON dicorp_legalizacion_encabezado (estado_id);
    CREATE INDEX IF NOT EXISTS idx_dicorp_enc_fecha      ON dicorp_legalizacion_encabezado (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_dicorp_enc_placa      ON dicorp_legalizacion_encabezado (placa);
    CREATE INDEX IF NOT EXISTS idx_dicorp_det_id_enc     ON dicorp_legalizacion_detalle (id_encabezado);
    CREATE INDEX IF NOT EXISTS idx_dicorp_det_cliente    ON dicorp_legalizacion_detalle (codigo_cliente);
    CREATE INDEX IF NOT EXISTS idx_dicorp_log_id_enc     ON dicorp_legalizacion_log (id_encabezado);
    CREATE INDEX IF NOT EXISTS idx_dicorp_pind_det       ON dicorp_pagos_individuales (id_detalle);
    CREATE INDEX IF NOT EXISTS idx_dicorp_pind_placa     ON dicorp_pagos_individuales (placa);
    CREATE INDEX IF NOT EXISTS idx_dicorp_pind_comp      ON dicorp_pagos_individuales (comprobante);
    CREATE INDEX IF NOT EXISTS idx_dicorp_pgru_placa     ON dicorp_pagos_grupales (placa);
    CREATE INDEX IF NOT EXISTS idx_dicorp_pgru_comp      ON dicorp_pagos_grupales (comprobante);
    CREATE INDEX IF NOT EXISTS idx_dicorp_sobre_placa    ON dicorp_sobrecostos (placa);
    CREATE INDEX IF NOT EXISTS idx_dicorp_sobre_enc      ON dicorp_sobrecostos (id_encabezado);
    CREATE INDEX IF NOT EXISTS idx_dicorp_devol_placa    ON dicorp_devoluciones (placa);
  `);
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const normKey = (k: string): string =>
  k.normalize('NFD').replace(/[̀-ͯ]/g, '')
   .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const normalizeRow = (row: Record<string, any>): Record<string, any> => {
  const r: Record<string, any> = {};
  Object.keys(row).forEach(k => { r[normKey(k)] = row[k]; });
  return r;
};

const parseDate = (v: any): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Fecha serial de Excel (época 1899-12-30), sin depender de XLSX.SSF (no siempre disponible en ESM).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (c > 1900) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    if (a > 1900) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const parseNum = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const getUser = (req: Request): string =>
  (req as any).user?.name || (req as any).user?.username || (req as any).user?.email || 'sistema';

// Fecha de hoy en Colombia (UTC-5), usada para validar que las fechas de pago no sean futuras.
const todayCO = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const isFutureDateCO = (fecha: any): boolean => {
  if (!fecha) return false;
  const d = String(fecha).slice(0, 10);
  return d > todayCO();
};

// ─── POST /dicorp-legalizacion/upload ─────────────────────────────────────────
interface ParsedGroup { cargue: string; fecha: string; rows: any[]; }

const parseEntregasWorkbook = (buffer: Buffer): { rows: any[]; groups: ParsedGroup[]; error?: string } => {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  let rawRows: any[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
    if (json.length && Object.keys(json[0]).some(k => normKey(k) === 'pedido_sap')) {
      rawRows = json;
      break;
    }
  }
  if (!rawRows.length) {
    return { rows: [], groups: [], error: 'No se encontró la hoja de detalle (columna "Pedido SAP") en el archivo.' };
  }

  const rows = rawRows.map(normalizeRow).filter(r => r.pedido_sap);

  const groupMap = new Map<string, any[]>();
  rows.forEach(r => {
    const cargue = String(r.cargue || r.cargue_numero || '').trim();
    if (!cargue) return;
    if (!groupMap.has(cargue)) groupMap.set(cargue, []);
    groupMap.get(cargue)!.push(r);
  });

  const groups: ParsedGroup[] = [];
  for (const [cargue, groupRows] of groupMap) {
    const fecha = parseDate(groupRows[0].fecha);
    if (!fecha) continue;
    groups.push({ cargue, fecha, rows: groupRows });
  }
  return { rows, groups };
};

// ─── POST /dicorp-legalizacion/upload-preview ─────────────────────────────────
// Analiza el Excel SIN escribir en la base: muestra qué se va a guardar y detecta
// si el cargue/pedidos ya existen (para advertir de cargas duplicadas).
export const previewEntregas = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió archivo.' });

    const { groups, error } = parseEntregasWorkbook(req.file.buffer);
    if (error) return res.status(400).json({ success: false, error });
    if (!groups.length) return res.status(400).json({ success: false, error: 'El archivo no contiene cargues válidos (verifica la columna Fecha).' });

    const cargues = [] as any[];
    let pedidosNuevosTotal = 0, pedidosExistentesTotal = 0;

    for (const g of groups) {
      const existing = await pool.query(
        `SELECT e.id, es.name AS estado, e.valor_total, e.pedidos_total, e.uploaded_by, e.uploaded_at
         FROM dicorp_legalizacion_encabezado e
         LEFT JOIN estados es ON es.id = e.estado_id
         WHERE e.fecha = $1 AND e.cargue_numero = $2`,
        [g.fecha, g.cargue]
      );
      const yaExiste = existing.rows.length > 0;
      const pedidosSap = g.rows.map(r => String(r.pedido_sap).trim());
      const existentesRes = await pool.query(
        `SELECT pedido_sap FROM dicorp_legalizacion_detalle WHERE pedido_sap = ANY($1::text[])`,
        [pedidosSap]
      );
      const pedidosExistentesSet = new Set(existentesRes.rows.map(r => r.pedido_sap));
      const pedidosNuevos = pedidosSap.filter(p => !pedidosExistentesSet.has(p)).length;
      const pedidosExistentes = pedidosSap.length - pedidosNuevos;
      pedidosNuevosTotal += pedidosNuevos;
      pedidosExistentesTotal += pedidosExistentes;

      const first = g.rows[0];
      cargues.push({
        cargue: g.cargue, fecha: g.fecha, placa: first.placa || null, conductor: first.nombre_conductor || null,
        pedidos: g.rows.length, pedidosNuevos, pedidosExistentes,
        valorTotal: g.rows.reduce((s, r) => s + parseNum(r.valor), 0),
        yaExiste, estadoActual: yaExiste ? existing.rows[0].estado : null,
        uploadedBy: yaExiste ? existing.rows[0].uploaded_by : null,
        uploadedAt: yaExiste ? existing.rows[0].uploaded_at : null,
      });
    }

    const esDuplicadoExacto = cargues.every(c => c.yaExiste && c.pedidosNuevos === 0);
    const hayConflictos = cargues.some(c => c.yaExiste || c.pedidosExistentes > 0);
    const hayLegalizados = cargues.some(c => c.estadoActual === 'LEGALIZADO');

    res.json({
      success: true,
      cargues,
      resumen: {
        totalCargues: cargues.length,
        carguesNuevos: cargues.filter(c => !c.yaExiste).length,
        carguesExistentes: cargues.filter(c => c.yaExiste).length,
        pedidosNuevos: pedidosNuevosTotal,
        pedidosExistentes: pedidosExistentesTotal,
        valorTotal: cargues.reduce((s, c) => s + c.valorTotal, 0),
        esDuplicadoExacto,
        hayConflictos,
        hayLegalizados,
      },
    });
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-PREVIEW]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const uploadEntregas = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió archivo.' });

    const uploadedBy = getUser(req);
    const modo = (req.body?.modo === 'editar') ? 'editar' : 'nuevo';
    const { rows, groups, error } = parseEntregasWorkbook(req.file.buffer);
    if (error) return res.status(400).json({ success: false, error });
    if (!groups.length) return res.status(400).json({ success: false, error: 'El archivo no contiene cargues válidos (verifica la columna Fecha).' });

    // ── Modo "nuevo": protege la integridad de los datos — si YA existe cualquier
    // cargue o pedido de este archivo, se rechaza toda la carga (nada se sobrescribe
    // en silencio). Para corregir información ya cargada hay que usar el modo "editar".
    if (modo === 'nuevo') {
      const duplicados: any[] = [];
      for (const g of groups) {
        const existing = await pool.query(
          `SELECT es.name AS estado FROM dicorp_legalizacion_encabezado e
           LEFT JOIN estados es ON es.id = e.estado_id
           WHERE e.fecha = $1 AND e.cargue_numero = $2`,
          [g.fecha, g.cargue]
        );
        const pedidosSap = g.rows.map(r => String(r.pedido_sap).trim());
        const existentesRes = await pool.query(
          `SELECT 1 FROM dicorp_legalizacion_detalle WHERE pedido_sap = ANY($1::text[]) LIMIT 1`,
          [pedidosSap]
        );
        if (existing.rows.length || existentesRes.rows.length) {
          duplicados.push({ cargue: g.cargue, fecha: g.fecha, estado: existing.rows[0]?.estado || null });
        }
      }
      if (duplicados.length) {
        return res.status(409).json({
          success: false,
          error: 'Ya existe información cargada para uno o más cargues/pedidos de este archivo. Si necesitas corregirla, usa "Editar Información Cargada".',
          duplicados,
        });
      }
    }

    const client = await pool.connect();
    let encInsertados = 0, encExistentes = 0, detInsertados = 0, detActualizados = 0, clientesUpsert = 0;
    const carguesOmitidosLegalizados: string[] = [];
    const encIdsAfectados = new Set<number>();

    try {
      await client.query('BEGIN');

      const clientesVistos = new Map<string, any>();
      rows.forEach(r => {
        const cod = String(r.codigo_cliente || '').trim();
        if (cod && !clientesVistos.has(cod)) clientesVistos.set(cod, r);
      });
      for (const [cod, r] of clientesVistos) {
        await client.query(`
          INSERT INTO dicorp_clientes (codigo_cliente, nombre_cliente, direccion, centro, nombre_centro, ciudad, barrio, telefono, vendedor, canal, origen, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (codigo_cliente) DO UPDATE SET
            nombre_cliente = EXCLUDED.nombre_cliente, direccion = EXCLUDED.direccion,
            centro = EXCLUDED.centro, nombre_centro = EXCLUDED.nombre_centro, ciudad = EXCLUDED.ciudad,
            barrio = EXCLUDED.barrio, telefono = EXCLUDED.telefono, vendedor = EXCLUDED.vendedor,
            canal = EXCLUDED.canal, origen = EXCLUDED.origen, updated_at = NOW()
        `, [
          cod, r.nombre_cliente || cod, r.direccion || null, r.centro || null, r.nombre_centro || null,
          r.ciudad || null, r.barrio || null, r.telefono || null, r.vendedor || null,
          r.canal_asignado_al_cliente || null, r.origen || null,
        ]);
        clientesUpsert++;
      }

      for (const { cargue, fecha, rows: grupoRows } of groups) {
        const first = grupoRows[0];

        let encId: number;
        const existing = await client.query(
          `SELECT id, estado_id FROM dicorp_legalizacion_encabezado WHERE fecha = $1 AND cargue_numero = $2`,
          [fecha, cargue]
        );
        if (existing.rows.length && existing.rows[0].estado_id === ESTADO_LEGALIZADO_ID) {
          // Un cargue ya legalizado nunca se toca (ni su encabezado ni sus pedidos) — protege la integridad financiera.
          carguesOmitidosLegalizados.push(cargue);
          continue;
        }
        if (existing.rows.length) {
          encId = existing.rows[0].id;
          encExistentes++;
        } else {
          const ins = await client.query(`
            INSERT INTO dicorp_legalizacion_encabezado
              (cargue_numero, fecha, placa, conductor_cedula, conductor_nombre, transportador, uploaded_by, uploaded_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
            RETURNING id
          `, [
            cargue, fecha, first.placa || null, first.cedula_conductor || null,
            first.nombre_conductor || null, first.transportador || 'MILLA SIETE S.A.S', uploadedBy,
          ]);
          encId = ins.rows[0].id;
          encInsertados++;
        }
        encIdsAfectados.add(encId);

        for (const r of grupoRows) {
          const pedido = String(r.pedido_sap).trim();
          const codCliente = r.codigo_cliente ? String(r.codigo_cliente).trim() : null;
          const result = await client.query(`
            INSERT INTO dicorp_legalizacion_detalle
              (id_encabezado, pedido_sap, factura_sap, codigo_cliente, kilos, unidades, valor_antes_iva, iva, valor)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (pedido_sap) DO UPDATE SET
              id_encabezado = EXCLUDED.id_encabezado, factura_sap = EXCLUDED.factura_sap,
              codigo_cliente = EXCLUDED.codigo_cliente, kilos = EXCLUDED.kilos, unidades = EXCLUDED.unidades,
              valor_antes_iva = EXCLUDED.valor_antes_iva, iva = EXCLUDED.iva, valor = EXCLUDED.valor
            RETURNING (xmax = 0) AS inserted
          `, [
            encId, pedido,
            (r.factura_sap && r.factura_sap !== '-') ? r.factura_sap : null,
            codCliente, Math.round(parseNum(r.kilos) * 100) / 100, parseInt(r.unidades) || 0,
            parseNum(r.valor_antes_de_iva), parseNum(r.iva), parseNum(r.valor),
          ]);
          if (result.rows[0]?.inserted) detInsertados++; else detActualizados++;
        }
      }

      for (const encId of encIdsAfectados) {
        await client.query(`
          UPDATE dicorp_legalizacion_encabezado e SET
            valor_total = COALESCE((SELECT SUM(valor) FROM dicorp_legalizacion_detalle WHERE id_encabezado = e.id), 0),
            kilos_total = ROUND(COALESCE((SELECT SUM(kilos) FROM dicorp_legalizacion_detalle WHERE id_encabezado = e.id), 0), 2),
            pedidos_total = COALESCE((SELECT COUNT(*) FROM dicorp_legalizacion_detalle WHERE id_encabezado = e.id), 0)
          WHERE e.id = $1
        `, [encId]);
        await client.query(`
          INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
          VALUES ($1, 'UPLOAD', $2, $3)
        `, [encId, `${modo === 'editar' ? 'Edición de' : 'Carga de'} entregas — archivo ${req.file!.originalname}`, uploadedBy]);
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        modo,
        encabezadosNuevos: encInsertados,
        encabezadosExistentes: encExistentes,
        detallesInsertados: detInsertados,
        detallesActualizados: detActualizados,
        clientesActualizados: clientesUpsert,
        carguesOmitidosLegalizados,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-UPLOAD]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/encabezados ─────────────────────────────────────
export const getEncabezados = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { estado, search, from, to, placa } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (estado === 'pendientes') conditions.push(`e.estado_id = '${ESTADO_PENDIENTE_ID}'`);
    else if (estado === 'cerrados') conditions.push(`e.estado_id <> '${ESTADO_PENDIENTE_ID}'`);

    if (from)  { conditions.push(`e.fecha >= $${p++}`); params.push(from); }
    if (to)    { conditions.push(`e.fecha <= $${p++}`); params.push(to); }
    if (placa) { conditions.push(`e.placa = $${p++}`); params.push(placa); }
    if (search) {
      conditions.push(`(e.cargue_numero ILIKE $${p} OR e.placa ILIKE $${p} OR e.conductor_nombre ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT e.*, es.name AS estado,
        COALESCE((
          SELECT SUM(pi.valor) FROM dicorp_pagos_individuales pi
          JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
          WHERE d.id_encabezado = e.id AND NOT pi.anulado
        ), 0) AS pagado_individual,
        (
          SELECT COUNT(*) FROM dicorp_pagos_individuales pi
          JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
          WHERE d.id_encabezado = e.id AND NOT pi.anulado
        ) AS pagos_individuales_count
      FROM dicorp_legalizacion_encabezado e
      LEFT JOIN estados es ON es.id = e.estado_id
      ${where}
      ORDER BY e.fecha DESC, e.cargue_numero DESC
    `, params);

    const totales = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE estado_id = '${ESTADO_PENDIENTE_ID}')  AS pendientes,
        COUNT(*) FILTER (WHERE estado_id <> '${ESTADO_PENDIENTE_ID}') AS cerrados,
        COALESCE(SUM(valor_total), 0) AS valor_total
      FROM dicorp_legalizacion_encabezado
    `);
    const sobrecostoTotal = await pool.query(`
      SELECT COALESCE(SUM(valor), 0) AS total FROM dicorp_sobrecostos WHERE status = 'APROBADO'
    `);

    res.json({
      success: true,
      data: result.rows,
      totales: { ...totales.rows[0], sobrecosto_total: sobrecostoTotal.rows[0].total },
    });
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-LIST]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/encabezados/:id ─────────────────────────────────
export const getEncabezadoDetalle = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;

    const enc = await pool.query(`
      SELECT e.*, es.name AS estado
      FROM dicorp_legalizacion_encabezado e
      LEFT JOIN estados es ON es.id = e.estado_id
      WHERE e.id = $1
    `, [id]);
    if (!enc.rows.length) return res.status(404).json({ success: false, error: 'Encabezado no encontrado.' });
    const placa = enc.rows[0].placa;

    const [detalle, logs, pagosIndividuales, pagosGrupales, sobrecostos, devoluciones] = await Promise.all([
      pool.query(`
        SELECT d.*, c.nombre_cliente, c.direccion, c.ciudad, c.barrio, c.vendedor, c.canal
        FROM dicorp_legalizacion_detalle d
        LEFT JOIN dicorp_clientes c ON c.codigo_cliente = d.codigo_cliente
        WHERE d.id_encabezado = $1
        ORDER BY d.id
      `, [id]),
      pool.query(`SELECT * FROM dicorp_legalizacion_log WHERE id_encabezado = $1 ORDER BY fecha DESC`, [id]),
      pool.query(`
        SELECT pi.*, mb.name AS banco, mp.name AS metodo_pago
        FROM dicorp_pagos_individuales pi
        JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
        LEFT JOIN master_records mb ON mb.id = pi.banco_id
        LEFT JOIN master_records mp ON mp.id = pi.metodo_pago_id
        WHERE d.id_encabezado = $1
        ORDER BY pi.created_at DESC
      `, [id]),
      pool.query(`
        SELECT pg.*, mb.name AS banco, mp.name AS metodo_pago
        FROM dicorp_pagos_grupales pg
        LEFT JOIN master_records mb ON mb.id = pg.banco_id
        LEFT JOIN master_records mp ON mp.id = pg.metodo_pago_id
        WHERE pg.placa = $1 ORDER BY pg.created_at DESC
      `, [placa]),
      pool.query(`SELECT * FROM dicorp_sobrecostos WHERE placa = $1 ORDER BY created_at DESC`, [placa]),
      pool.query(`SELECT * FROM dicorp_devoluciones WHERE placa = $1 ORDER BY created_at DESC`, [placa]),
    ]);

    res.json({
      success: true,
      encabezado: enc.rows[0],
      detalle: detalle.rows,
      logs: logs.rows,
      pagosIndividuales: pagosIndividuales.rows,
      pagosGrupales: pagosGrupales.rows,
      sobrecostos: sobrecostos.rows,
      devoluciones: devoluciones.rows,
    });
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-DETALLE]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/check-comprobante/:reference ────────────────────
// Busca la referencia tanto en pagos individuales como grupales (igual que Conciliación de Facturas).
export const checkComprobante = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const reference = String(req.params.reference ?? '').trim();
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
    const excludeType = req.query.excludeType ? String(req.query.excludeType) : null;
    if (!reference) return res.status(400).json({ success: false, error: 'La referencia es requerida.' });

    const result = await pool.query(`
      SELECT 'individual' AS tipo, pi.id, d.id_encabezado, e.cargue_numero, d.pedido_sap,
        c.nombre_cliente, c.ciudad, pi.placa, mb.name AS banco, mp.name AS metodo_pago, pi.observacion,
        pi.valor, pi.fecha_pago, pi.created_at, pi.usuario
      FROM dicorp_pagos_individuales pi
      JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
      LEFT JOIN dicorp_legalizacion_encabezado e ON e.id = d.id_encabezado
      LEFT JOIN dicorp_clientes c ON c.codigo_cliente = d.codigo_cliente
      LEFT JOIN master_records mb ON mb.id = pi.banco_id
      LEFT JOIN master_records mp ON mp.id = pi.metodo_pago_id
      WHERE TRIM(UPPER(pi.comprobante)) = TRIM(UPPER($1)) AND NOT pi.anulado
        AND ($3::int IS NULL OR $2 IS DISTINCT FROM 'individual' OR pi.id <> $3::int)

      UNION ALL

      SELECT 'grupal' AS tipo, pg.id, NULL AS id_encabezado, NULL AS cargue_numero, NULL AS pedido_sap,
        NULL AS nombre_cliente, NULL AS ciudad, pg.placa, mb2.name AS banco, mp2.name AS metodo_pago, pg.observacion,
        pg.valor, pg.fecha_pago, pg.created_at, pg.usuario
      FROM dicorp_pagos_grupales pg
      LEFT JOIN master_records mb2 ON mb2.id = pg.banco_id
      LEFT JOIN master_records mp2 ON mp2.id = pg.metodo_pago_id
      WHERE TRIM(UPPER(pg.comprobante)) = TRIM(UPPER($1)) AND NOT pg.anulado
        AND ($3::int IS NULL OR $2 IS DISTINCT FROM 'grupal' OR pg.id <> $3::int)
    `, [reference, excludeType, excludeId]);

    res.json({ success: true, exists: result.rows.length > 0, data: result.rows });
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-CHECK-COMPROBANTE]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const checkComprobanteConflict = async (reference: string, tipo: 'individual' | 'grupal', excludeId: number | null) => {
  const result = await pool.query(`
    SELECT 'individual' AS tipo, pi.id, d.id_encabezado, e.cargue_numero, d.pedido_sap,
      c.nombre_cliente, c.ciudad, pi.placa, mb.name AS banco, mp.name AS metodo_pago, pi.observacion,
      pi.valor, pi.fecha_pago, pi.created_at, pi.usuario
    FROM dicorp_pagos_individuales pi
    JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
    LEFT JOIN dicorp_legalizacion_encabezado e ON e.id = d.id_encabezado
    LEFT JOIN dicorp_clientes c ON c.codigo_cliente = d.codigo_cliente
    LEFT JOIN master_records mb ON mb.id = pi.banco_id
    LEFT JOIN master_records mp ON mp.id = pi.metodo_pago_id
    WHERE TRIM(UPPER(pi.comprobante)) = TRIM(UPPER($1)) AND NOT pi.anulado
      AND ($3::int IS NULL OR $2 IS DISTINCT FROM 'individual' OR pi.id <> $3::int)

    UNION ALL

    SELECT 'grupal' AS tipo, pg.id, NULL AS id_encabezado, NULL AS cargue_numero, NULL AS pedido_sap,
      NULL AS nombre_cliente, NULL AS ciudad, pg.placa, mb2.name AS banco, mp2.name AS metodo_pago, pg.observacion,
      pg.valor, pg.fecha_pago, pg.created_at, pg.usuario
    FROM dicorp_pagos_grupales pg
    LEFT JOIN master_records mb2 ON mb2.id = pg.banco_id
    LEFT JOIN master_records mp2 ON mp2.id = pg.metodo_pago_id
    WHERE TRIM(UPPER(pg.comprobante)) = TRIM(UPPER($1)) AND NOT pg.anulado
      AND ($3::int IS NULL OR $2 IS DISTINCT FROM 'grupal' OR pg.id <> $3::int)
  `, [reference, tipo, excludeId]);
  return result.rows;
};

// ─── POST /dicorp-legalizacion/pagos-individuales ─────────────────────────────
// Consignación/transferencia amarrada a UN pedido (factura) específico.
export const savePagoIndividual = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { idDetalle, bancoId, comprobante, valor, fechaPago, metodoPagoId, observacion } = req.body || {};

    if (!idDetalle) return res.status(400).json({ success: false, error: 'idDetalle es requerido.' });
    if (!comprobante || String(comprobante).trim() === '') {
      return res.status(400).json({ success: false, error: 'El número de comprobante es requerido.' });
    }
    if (!valor || parseNum(valor) <= 0) {
      return res.status(400).json({ success: false, error: 'El valor del pago es requerido.' });
    }
    if (!fechaPago) return res.status(400).json({ success: false, error: 'La fecha de pago es requerida.' });
    if (isFutureDateCO(fechaPago)) {
      return res.status(400).json({ success: false, error: 'La fecha de pago no puede ser posterior al día de hoy.' });
    }

    const det = await pool.query(`
      SELECT d.id_encabezado, d.valor AS valor_pedido, e.placa,
        COALESCE((SELECT SUM(valor) FROM dicorp_pagos_individuales WHERE id_detalle = d.id AND NOT anulado), 0) AS pagado_previo
      FROM dicorp_legalizacion_detalle d
      JOIN dicorp_legalizacion_encabezado e ON e.id = d.id_encabezado
      WHERE d.id = $1
    `, [idDetalle]);
    if (!det.rows.length) return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
    const { id_encabezado: idEncabezado, placa, valor_pedido: valorPedido, pagado_previo: pagadoPrevio } = det.rows[0];

    const saldoDisponible = parseNum(valorPedido) - parseNum(pagadoPrevio);
    if (parseNum(valor) > saldoDisponible + 1) {
      return res.status(400).json({
        success: false,
        error: `El valor (${fmtLog(valor)}) no puede ser mayor al saldo pendiente del pedido (${fmtLog(saldoDisponible)}).`,
      });
    }

    const dup = await checkComprobanteConflict(comprobante, 'individual', null);
    if (dup.length) {
      return res.status(409).json({ success: false, error: 'Este comprobante ya fue reportado en otra legalización.', duplicado: dup });
    }

    const ins = await pool.query(`
      INSERT INTO dicorp_pagos_individuales (id_detalle, placa, banco_id, comprobante, valor, fecha_pago, metodo_pago_id, observacion, usuario)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [idDetalle, placa, bancoId || null, String(comprobante).trim(), parseNum(valor), fechaPago || null, metodoPagoId || METODO_PAGO_DEFAULT_ID, observacion || null, usuario]);

    await pool.query(`
      INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
      VALUES ($1, 'PAGO_INDIVIDUAL', $2, $3)
    `, [idEncabezado, `Comprobante ${comprobante} — ${fmtLog(valor)}`, usuario]);

    res.json({ success: true, pago: ins.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-PAGO-INDIVIDUAL]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /dicorp-legalizacion/pagos-grupales ─────────────────────────────────
// Consignación de la placa que acumula/cubre varios cargues (no se amarra a uno solo).
export const savePagoGrupal = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { placa, bancoId, comprobante, valor, fechaPago, metodoPagoId, observacion } = req.body || {};

    if (!placa) return res.status(400).json({ success: false, error: 'La placa es requerida.' });
    if (!comprobante || String(comprobante).trim() === '') {
      return res.status(400).json({ success: false, error: 'El número de comprobante es requerido.' });
    }
    if (!valor || parseNum(valor) <= 0) {
      return res.status(400).json({ success: false, error: 'El valor del pago es requerido.' });
    }
    if (!fechaPago) return res.status(400).json({ success: false, error: 'La fecha de pago es requerida.' });
    if (isFutureDateCO(fechaPago)) {
      return res.status(400).json({ success: false, error: 'La fecha de pago no puede ser posterior al día de hoy.' });
    }

    const dup = await checkComprobanteConflict(comprobante, 'grupal', null);
    if (dup.length) {
      return res.status(409).json({ success: false, error: 'Este comprobante ya fue reportado en otra legalización.', duplicado: dup });
    }

    const ins = await pool.query(`
      INSERT INTO dicorp_pagos_grupales (placa, banco_id, comprobante, valor, fecha_pago, metodo_pago_id, observacion, usuario)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [placa, bancoId || null, String(comprobante).trim(), parseNum(valor), fechaPago || null, metodoPagoId || METODO_PAGO_DEFAULT_ID, observacion || null, usuario]);

    res.json({ success: true, pago: ins.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-PAGO-GRUPAL]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /dicorp-legalizacion/devoluciones ───────────────────────────────────
// Devolución de mercancía/dinero de la placa — valor general, no atado a un cargue puntual.
export const saveDevolucion = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { placa, valor, fecha, observacion } = req.body || {};

    if (!placa) return res.status(400).json({ success: false, error: 'La placa es requerida.' });
    if (!valor || parseNum(valor) <= 0) {
      return res.status(400).json({ success: false, error: 'El valor de la devolución es requerido.' });
    }
    if (!fecha) return res.status(400).json({ success: false, error: 'La fecha de la devolución es requerida.' });
    if (isFutureDateCO(fecha)) {
      return res.status(400).json({ success: false, error: 'La fecha no puede ser posterior al día de hoy.' });
    }

    const ins = await pool.query(`
      INSERT INTO dicorp_devoluciones (placa, valor, fecha, observacion, usuario)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [placa, parseNum(valor), fecha, observacion || null, usuario]);

    res.json({ success: true, devolucion: ins.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-DEVOLUCION]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /dicorp-legalizacion/sobrecostos ────────────────────────────────────
export const saveSobrecosto = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { placa, idEncabezado, valor, referencia, fecha, tipo, observaciones } = req.body || {};
    if (!placa) return res.status(400).json({ success: false, error: 'La placa es requerida.' });
    if (!valor || parseNum(valor) <= 0) {
      return res.status(400).json({ success: false, error: 'El valor del sobrecosto es requerido.' });
    }
    if (!fecha) return res.status(400).json({ success: false, error: 'La fecha del sobrecosto es requerida.' });
    if (isFutureDateCO(fecha)) {
      return res.status(400).json({ success: false, error: 'La fecha no puede ser posterior al día de hoy.' });
    }

    const ins = await pool.query(`
      INSERT INTO dicorp_sobrecostos (placa, id_encabezado, valor, referencia, fecha, tipo, status, observaciones, usuario)
      VALUES ($1,$2,$3,$4,$5,$6,'PENDIENTE',$7,$8)
      RETURNING *
    `, [placa, idEncabezado || null, parseNum(valor), referencia || null, fecha || null, tipo || 'EFECTIVO', observaciones || null, usuario]);

    if (idEncabezado) {
      await pool.query(`
        INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
        VALUES ($1, 'SOBRECOSTO', $2, $3)
      `, [idEncabezado, `Sobrecosto registrado — ${fmtLog(valor)}`, usuario]);
    }

    res.json({ success: true, sobrecosto: ins.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-SOBRECOSTO]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/sobrecostos/:id ─────────────────────────────────
// Completa/corrige un sobrecosto que quedó con datos faltantes (NIT, fecha, observación...).
// Solo se puede editar mientras esté PENDIENTE — uno ya APROBADO queda bloqueado.
export const updateSobrecosto = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { id } = req.params;
    const { idEncabezado, valor, referencia, fecha, tipo, observaciones } = req.body || {};

    if (!valor || parseNum(valor) <= 0) {
      return res.status(400).json({ success: false, error: 'El valor del sobrecosto es requerido.' });
    }
    if (!fecha) return res.status(400).json({ success: false, error: 'La fecha del sobrecosto es requerida.' });
    if (isFutureDateCO(fecha)) {
      return res.status(400).json({ success: false, error: 'La fecha no puede ser posterior al día de hoy.' });
    }

    const cur = await pool.query(`SELECT * FROM dicorp_sobrecostos WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Sobrecosto no encontrado.' });
    if (cur.rows[0].status !== 'PENDIENTE') {
      return res.status(400).json({ success: false, error: 'Solo se pueden editar sobrecostos pendientes de aprobación.' });
    }

    const result = await pool.query(`
      UPDATE dicorp_sobrecostos SET
        id_encabezado = $1, valor = $2, referencia = $3, fecha = $4, tipo = $5, observaciones = $6
      WHERE id = $7
      RETURNING *
    `, [idEncabezado || null, parseNum(valor), referencia || null, fecha, tipo || 'EFECTIVO', observaciones || null, id]);

    const idEnc = result.rows[0].id_encabezado;
    if (idEnc) {
      await pool.query(`
        INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
        VALUES ($1, 'SOBRECOSTO_EDITADO', $2, $3)
      `, [idEnc, `Sobrecosto actualizado — ${fmtLog(valor)}`, usuario]);
    }

    res.json({ success: true, sobrecosto: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-SOBRECOSTO-UPDATE]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/sobrecostos/:id/aprobar ─────────────────────────
export const aprobarSobrecosto = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const usuario = getUser(req);

    const cur = await pool.query(`SELECT * FROM dicorp_sobrecostos WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Sobrecosto no encontrado.' });
    if (!cur.rows[0].referencia) {
      return res.status(400).json({ success: false, error: 'Debes registrar una referencia/NIT antes de aprobar el sobrecosto.' });
    }

    const result = await pool.query(`
      UPDATE dicorp_sobrecostos SET status = 'APROBADO' WHERE id = $1 RETURNING *
    `, [id]);

    if (result.rows[0].id_encabezado) {
      await pool.query(`
        INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
        VALUES ($1, 'SOBRECOSTO_APROBADO', $2, $3)
      `, [result.rows[0].id_encabezado, `Sobrecosto aprobado — ${fmtLog(result.rows[0].valor)}`, usuario]);
    }

    res.json({ success: true, sobrecosto: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-SOBRECOSTO-APROBAR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/resumen-placas ──────────────────────────────────
// Acumulado por placa a través de TODOS sus cargues: esperado vs pagado (individual+grupal) vs sobrecosto vs pendiente.
export const getResumenPlacas = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const result = await pool.query(`
      WITH esperado AS (
        SELECT placa, SUM(valor_total) AS esperado, COUNT(*) AS cargues,
               MAX(conductor_nombre) AS conductor_nombre
        FROM dicorp_legalizacion_encabezado GROUP BY placa
      ),
      individual AS (
        SELECT placa, SUM(valor) AS pagado_individual FROM dicorp_pagos_individuales WHERE NOT anulado GROUP BY placa
      ),
      grupal AS (
        SELECT placa, SUM(valor) AS pagado_grupal FROM dicorp_pagos_grupales WHERE NOT anulado GROUP BY placa
      ),
      sobrecosto AS (
        SELECT placa,
               SUM(valor) FILTER (WHERE status = 'APROBADO') AS sobrecosto_aprobado,
               SUM(valor) FILTER (WHERE status = 'PENDIENTE') AS sobrecosto_pendiente
        FROM dicorp_sobrecostos WHERE NOT anulado GROUP BY placa
      )
      SELECT
        e.placa, e.conductor_nombre, e.cargues, e.esperado,
        COALESCE(i.pagado_individual, 0) AS pagado_individual,
        COALESCE(g.pagado_grupal, 0) AS pagado_grupal,
        COALESCE(s.sobrecosto_aprobado, 0) AS sobrecosto_aprobado,
        COALESCE(s.sobrecosto_pendiente, 0) AS sobrecosto_pendiente,
        e.esperado - COALESCE(i.pagado_individual,0) - COALESCE(g.pagado_grupal,0) - COALESCE(s.sobrecosto_aprobado,0) AS pendiente
      FROM esperado e
      LEFT JOIN individual i ON i.placa = e.placa
      LEFT JOIN grupal g ON g.placa = e.placa
      LEFT JOIN sobrecosto s ON s.placa = e.placa
      ORDER BY pendiente DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[DICORP-RESUMEN-PLACAS]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/consolidado-pendientes ──────────────────────────
// Consolidado por PLACA + FECHA de todos los cargues aún pendientes, con el saldo
// ya neteado (pagos individuales de cada cargue + reparto FIFO de pagos grupales
// y sobrecostos aprobados de la placa, más antiguos primero).
export const getConsolidadoPendientes = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const result = await pool.query(`
      WITH cargues AS (
        SELECT e.id, e.placa, e.fecha, e.cargue_numero, e.conductor_nombre, e.valor_total
        FROM dicorp_legalizacion_encabezado e
        WHERE e.estado_id = '${ESTADO_PENDIENTE_ID}'
      ),
      individual AS (
        SELECT d.id_encabezado, SUM(pi.valor) AS pagado
        FROM dicorp_pagos_individuales pi
        JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
        WHERE NOT pi.anulado
        GROUP BY d.id_encabezado
      ),
      saldo AS (
        SELECT c.*, COALESCE(i.pagado, 0) AS pagado_individual,
          (c.valor_total - COALESCE(i.pagado, 0)) AS saldo_individual,
          SUM(c.valor_total - COALESCE(i.pagado, 0)) OVER (PARTITION BY c.placa ORDER BY c.fecha, c.id ROWS UNBOUNDED PRECEDING) AS running_saldo
        FROM cargues c
        LEFT JOIN individual i ON i.id_encabezado = c.id
      ),
      pool AS (
        SELECT c.placa,
          COALESCE((SELECT SUM(valor) FROM dicorp_pagos_grupales g WHERE g.placa = c.placa AND NOT g.anulado), 0) AS grupal_total,
          COALESCE((SELECT SUM(valor) FROM dicorp_sobrecostos s WHERE s.placa = c.placa AND s.status = 'APROBADO' AND NOT s.anulado), 0) AS sobrecosto_aprobado,
          COALESCE((SELECT SUM(valor) FROM dicorp_sobrecostos s WHERE s.placa = c.placa AND s.status = 'PENDIENTE' AND NOT s.anulado), 0) AS sobrecosto_pendiente,
          COALESCE((SELECT SUM(valor) FROM dicorp_devoluciones dv WHERE dv.placa = c.placa AND NOT dv.anulado), 0) AS devolucion_total
        FROM (SELECT DISTINCT placa FROM cargues) c
      ),
      detalle AS (
        SELECT s.*, p.grupal_total, p.sobrecosto_aprobado, p.sobrecosto_pendiente, p.devolucion_total,
          (p.grupal_total + p.sobrecosto_aprobado + p.devolucion_total) AS pool_total,
          LEAST(s.saldo_individual, GREATEST((p.grupal_total + p.sobrecosto_aprobado + p.devolucion_total) - (s.running_saldo - s.saldo_individual), 0)) AS pagado_pool
        FROM saldo s JOIN pool p ON p.placa = s.placa
      )
      SELECT d.placa, d.fecha, MAX(d.conductor_nombre) AS conductor_nombre, COUNT(*) AS cargues,
        string_agg(DISTINCT d.cargue_numero, ', ' ORDER BY d.cargue_numero) AS cargue_numeros,
        SUM(d.valor_total) AS valor_total, SUM(d.pagado_individual) AS pagado_individual,
        SUM(d.pagado_pool) AS pagado_pool, SUM(d.saldo_individual - d.pagado_pool) AS pendiente,
        MAX(d.grupal_total) AS pagado_grupal, MAX(d.sobrecosto_aprobado) AS sobrecosto_aprobado,
        MAX(d.sobrecosto_pendiente) AS sobrecosto_pendiente, MAX(d.devolucion_total) AS devolucion_total,
        NULL::text AS tipo_descuadre, NULL::text AS comentario_descuadre,
        (SELECT banco FROM (
          SELECT mb3.name AS banco, pi3.fecha_pago FROM dicorp_pagos_individuales pi3
            JOIN dicorp_legalizacion_detalle d3 ON d3.id = pi3.id_detalle
            JOIN dicorp_legalizacion_encabezado e3 ON e3.id = d3.id_encabezado
            LEFT JOIN master_records mb3 ON mb3.id = pi3.banco_id
            WHERE e3.placa = d.placa AND e3.fecha = d.fecha AND NOT pi3.anulado
          UNION ALL
          SELECT mb4.name AS banco, pg3.fecha_pago FROM dicorp_pagos_grupales pg3
            LEFT JOIN master_records mb4 ON mb4.id = pg3.banco_id
            WHERE pg3.placa = d.placa AND NOT pg3.anulado
        ) t ORDER BY fecha_pago DESC NULLS LAST LIMIT 1) AS banco_reciente,
        (SELECT fecha_pago FROM (
          SELECT mb3.name AS banco, pi3.fecha_pago FROM dicorp_pagos_individuales pi3
            JOIN dicorp_legalizacion_detalle d3 ON d3.id = pi3.id_detalle
            JOIN dicorp_legalizacion_encabezado e3 ON e3.id = d3.id_encabezado
            LEFT JOIN master_records mb3 ON mb3.id = pi3.banco_id
            WHERE e3.placa = d.placa AND e3.fecha = d.fecha AND NOT pi3.anulado
          UNION ALL
          SELECT mb4.name AS banco, pg3.fecha_pago FROM dicorp_pagos_grupales pg3
            LEFT JOIN master_records mb4 ON mb4.id = pg3.banco_id
            WHERE pg3.placa = d.placa AND NOT pg3.anulado
        ) t ORDER BY fecha_pago DESC NULLS LAST LIMIT 1) AS fecha_consignacion_reciente
      FROM detalle d
      GROUP BY d.placa, d.fecha
      ORDER BY d.fecha DESC, pendiente DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[DICORP-CONSOLIDADO-PENDIENTES]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /dicorp-legalizacion/consolidado-por-fecha ───────────────────────────
// Igual que consolidado-pendientes pero SIN filtrar por estado (trae PENDIENTE + LEGALIZADO)
// y con el tipo/comentario de descuadre REAL (el que se registró al cerrar), no derivado.
// Pensado para exportar "cómo va la legalización" de un rango de fechas, sin importar el estado.
export const getConsolidadoPorFecha = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { from, to, placa, conductor } = req.query as any;
    if (!from || !to) return res.status(400).json({ success: false, error: 'El rango de fechas (from, to) es requerido.' });

    const conditions: string[] = [`e.fecha BETWEEN $1 AND $2`];
    const params: any[] = [from, to];
    let p = 3;
    if (placa) { conditions.push(`e.placa = $${p++}`); params.push(placa); }
    if (conductor) { conditions.push(`e.conductor_nombre ILIKE $${p++}`); params.push(`%${conductor}%`); }

    const result = await pool.query(`
      WITH cargues AS (
        SELECT e.id, e.placa, e.fecha, e.cargue_numero, e.conductor_nombre, e.valor_total,
               es.name AS estado, e.tipo_descuadre, e.comentario_descuadre
        FROM dicorp_legalizacion_encabezado e
        LEFT JOIN estados es ON es.id = e.estado_id
        WHERE ${conditions.join(' AND ')}
      ),
      individual AS (
        SELECT d.id_encabezado, SUM(pi.valor) AS pagado
        FROM dicorp_pagos_individuales pi
        JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
        WHERE NOT pi.anulado
        GROUP BY d.id_encabezado
      ),
      saldo AS (
        SELECT c.*, COALESCE(i.pagado, 0) AS pagado_individual,
          (c.valor_total - COALESCE(i.pagado, 0)) AS saldo_individual,
          SUM(c.valor_total - COALESCE(i.pagado, 0)) OVER (PARTITION BY c.placa ORDER BY c.fecha, c.id ROWS UNBOUNDED PRECEDING) AS running_saldo
        FROM cargues c
        LEFT JOIN individual i ON i.id_encabezado = c.id
      ),
      pool AS (
        SELECT c.placa,
          COALESCE((SELECT SUM(valor) FROM dicorp_pagos_grupales g WHERE g.placa = c.placa AND NOT g.anulado), 0) AS grupal_total,
          COALESCE((SELECT SUM(valor) FROM dicorp_sobrecostos s WHERE s.placa = c.placa AND s.status = 'APROBADO' AND NOT s.anulado), 0) AS sobrecosto_aprobado,
          COALESCE((SELECT SUM(valor) FROM dicorp_sobrecostos s WHERE s.placa = c.placa AND s.status = 'PENDIENTE' AND NOT s.anulado), 0) AS sobrecosto_pendiente,
          COALESCE((SELECT SUM(valor) FROM dicorp_devoluciones dv WHERE dv.placa = c.placa AND NOT dv.anulado), 0) AS devolucion_total
        FROM (SELECT DISTINCT placa FROM cargues) c
      ),
      detalle AS (
        SELECT s.*, p.grupal_total, p.sobrecosto_aprobado, p.sobrecosto_pendiente, p.devolucion_total,
          LEAST(s.saldo_individual, GREATEST((p.grupal_total + p.sobrecosto_aprobado + p.devolucion_total) - (s.running_saldo - s.saldo_individual), 0)) AS pagado_pool
        FROM saldo s JOIN pool p ON p.placa = s.placa
      )
      SELECT d.placa, d.fecha, MAX(d.conductor_nombre) AS conductor_nombre, COUNT(*) AS cargues,
        string_agg(DISTINCT d.cargue_numero, ', ' ORDER BY d.cargue_numero) AS cargue_numeros,
        CASE WHEN COUNT(DISTINCT d.estado) = 1 THEN MAX(d.estado) ELSE 'MIXTO' END AS estado,
        SUM(d.valor_total) AS valor_total, SUM(d.pagado_individual) AS pagado_individual,
        SUM(d.pagado_pool) AS pagado_pool, SUM(d.saldo_individual - d.pagado_pool) AS pendiente,
        MAX(d.grupal_total) AS pagado_grupal, MAX(d.sobrecosto_aprobado) AS sobrecosto_aprobado,
        MAX(d.sobrecosto_pendiente) AS sobrecosto_pendiente, MAX(d.devolucion_total) AS devolucion_total,
        string_agg(DISTINCT d.tipo_descuadre, ', ') AS tipo_descuadre,
        string_agg(DISTINCT d.comentario_descuadre, ' | ') AS comentario_descuadre,
        (SELECT banco FROM (
          SELECT mb3.name AS banco, pi3.fecha_pago FROM dicorp_pagos_individuales pi3
            JOIN dicorp_legalizacion_detalle d3 ON d3.id = pi3.id_detalle
            JOIN dicorp_legalizacion_encabezado e3 ON e3.id = d3.id_encabezado
            LEFT JOIN master_records mb3 ON mb3.id = pi3.banco_id
            WHERE e3.placa = d.placa AND e3.fecha = d.fecha AND NOT pi3.anulado
          UNION ALL
          SELECT mb4.name AS banco, pg3.fecha_pago FROM dicorp_pagos_grupales pg3
            LEFT JOIN master_records mb4 ON mb4.id = pg3.banco_id
            WHERE pg3.placa = d.placa AND NOT pg3.anulado
        ) t ORDER BY fecha_pago DESC NULLS LAST LIMIT 1) AS banco_reciente,
        (SELECT fecha_pago FROM (
          SELECT mb3.name AS banco, pi3.fecha_pago FROM dicorp_pagos_individuales pi3
            JOIN dicorp_legalizacion_detalle d3 ON d3.id = pi3.id_detalle
            JOIN dicorp_legalizacion_encabezado e3 ON e3.id = d3.id_encabezado
            LEFT JOIN master_records mb3 ON mb3.id = pi3.banco_id
            WHERE e3.placa = d.placa AND e3.fecha = d.fecha AND NOT pi3.anulado
          UNION ALL
          SELECT mb4.name AS banco, pg3.fecha_pago FROM dicorp_pagos_grupales pg3
            LEFT JOIN master_records mb4 ON mb4.id = pg3.banco_id
            WHERE pg3.placa = d.placa AND NOT pg3.anulado
        ) t ORDER BY fecha_pago DESC NULLS LAST LIMIT 1) AS fecha_consignacion_reciente
      FROM detalle d
      GROUP BY d.placa, d.fecha
      ORDER BY d.fecha DESC, pendiente DESC
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[DICORP-CONSOLIDADO-POR-FECHA]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/cerrar-placa-dia ────────────────────────────────
// Cierra (marca LEGALIZADO) todos los cargues pendientes de una placa en una fecha puntual.
export const cerrarPlacaDia = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const usuario = getUser(req);
    const { placa, fecha, observacion, tipoDescuadre, comentarioDescuadre } = req.body || {};
    if (!placa || !fecha) return res.status(400).json({ success: false, error: 'La placa y la fecha son requeridas.' });

    // Si al momento de cerrar aún queda saldo pendiente, es obligatorio clasificar el descuadre.
    const pend = await pool.query(`
      SELECT e.id, e.valor_total,
        COALESCE((SELECT SUM(pi.valor) FROM dicorp_pagos_individuales pi
                  JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle WHERE d.id_encabezado = e.id AND NOT pi.anulado), 0) AS pagado_individual
      FROM dicorp_legalizacion_encabezado e
      WHERE e.placa = $1 AND e.fecha = $2 AND e.estado_id = '${ESTADO_PENDIENTE_ID}'
    `, [placa, fecha]);
    if (!pend.rows.length) return res.status(404).json({ success: false, error: 'No hay cargues pendientes para esa placa y fecha.' });

    const grupalTotal = await pool.query(`SELECT COALESCE(SUM(valor),0) AS v FROM dicorp_pagos_grupales WHERE placa = $1 AND NOT anulado`, [placa]);
    const sobrecostoAprobado = await pool.query(`SELECT COALESCE(SUM(valor),0) AS v FROM dicorp_sobrecostos WHERE placa = $1 AND status = 'APROBADO' AND NOT anulado`, [placa]);
    const devolucionTotal = await pool.query(`SELECT COALESCE(SUM(valor),0) AS v FROM dicorp_devoluciones WHERE placa = $1 AND NOT anulado`, [placa]);
    const valorTotal = pend.rows.reduce((s, r) => s + parseNum(r.valor_total), 0);
    const pagadoIndividual = pend.rows.reduce((s, r) => s + parseNum(r.pagado_individual), 0);
    const pool_ = parseNum(grupalTotal.rows[0].v) + parseNum(sobrecostoAprobado.rows[0].v) + parseNum(devolucionTotal.rows[0].v);
    const saldoPendiente = valorTotal - pagadoIndividual - pool_;

    if (saldoPendiente > 1 && !tipoDescuadre) {
      return res.status(400).json({
        success: false,
        error: 'Aún hay saldo pendiente por legalizar. Debes indicar si el descuadre es en efectivo o mercancía antes de cerrar.',
        requiereTipoDescuadre: true,
        saldoPendiente,
      });
    }

    const result = await pool.query(`
      UPDATE dicorp_legalizacion_encabezado SET
        estado_id = '${ESTADO_LEGALIZADO_ID}', tipo_descuadre = $3, comentario_descuadre = $4, cerrado_por = $5, cerrado_at = NOW()
      WHERE placa = $1 AND fecha = $2 AND estado_id = '${ESTADO_PENDIENTE_ID}'
      RETURNING id
    `, [placa, fecha, saldoPendiente > 1 ? (tipoDescuadre || null) : null, comentarioDescuadre || null, usuario]);

    for (const row of result.rows) {
      await pool.query(`
        INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
        VALUES ($1, 'CIERRE_PLACA_DIA', $2, $3)
      `, [row.id, observacion || `Cierre de placa ${placa} — ${fecha}${tipoDescuadre ? ` (descuadre: ${tipoDescuadre})` : ''}`, usuario]);
    }

    res.json({ success: true, cargues_cerrados: result.rows.length });
  } catch (err: any) {
    console.error('[DICORP-CERRAR-PLACA-DIA]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/encabezados/:id/estado ──────────────────────────
export const cambiarEstado = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { estado, observacion } = req.body || {};
    const usuario = getUser(req);
    if (!estado) return res.status(400).json({ success: false, error: 'El estado es requerido.' });

    // Acepta tanto el id del catálogo (EST-XX) como el nombre ('PENDIENTE'/'LEGALIZADO').
    const estadoId = estado === 'LEGALIZADO' ? ESTADO_LEGALIZADO_ID
      : estado === 'PENDIENTE' ? ESTADO_PENDIENTE_ID
      : estado;

    const result = await pool.query(
      `UPDATE dicorp_legalizacion_encabezado SET estado_id = $1 WHERE id = $2 RETURNING *`,
      [estadoId, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Encabezado no encontrado.' });

    await pool.query(`
      INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
      VALUES ($1, 'ESTADO', $2, $3)
    `, [id, observacion || `Cambio de estado a ${estado}`, usuario]);

    res.json({ success: true, encabezado: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-LEGALIZACION-ESTADO]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/pagos-individuales/:id/anular ───────────────────
// Anulación con motivo obligatorio — nunca se borra el registro, solo se marca y se reversa el valor.
export const anularPagoIndividual = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario = getUser(req);
    if (!motivo || !String(motivo).trim()) return res.status(400).json({ success: false, error: 'El motivo de anulación es requerido.' });

    const cur = await pool.query(`
      SELECT pi.*, d.id_encabezado FROM dicorp_pagos_individuales pi
      JOIN dicorp_legalizacion_detalle d ON d.id = pi.id_detalle
      WHERE pi.id = $1
    `, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Pago no encontrado.' });
    if (cur.rows[0].anulado) return res.status(400).json({ success: false, error: 'Este pago ya fue anulado.' });

    const result = await pool.query(`
      UPDATE dicorp_pagos_individuales SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, String(motivo).trim(), usuario]);

    await pool.query(`
      INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
      VALUES ($1, 'PAGO_INDIVIDUAL_ANULADO', $2, $3)
    `, [cur.rows[0].id_encabezado, `Comprobante ${cur.rows[0].comprobante} anulado (${fmtLog(cur.rows[0].valor)}) — Motivo: ${motivo}`, usuario]);

    res.json({ success: true, pago: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-PAGO-INDIVIDUAL-ANULAR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/pagos-grupales/:id/anular ───────────────────────
export const anularPagoGrupal = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario = getUser(req);
    if (!motivo || !String(motivo).trim()) return res.status(400).json({ success: false, error: 'El motivo de anulación es requerido.' });

    const cur = await pool.query(`SELECT * FROM dicorp_pagos_grupales WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Pago no encontrado.' });
    if (cur.rows[0].anulado) return res.status(400).json({ success: false, error: 'Este pago ya fue anulado.' });

    const result = await pool.query(`
      UPDATE dicorp_pagos_grupales SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, String(motivo).trim(), usuario]);

    await pool.query(`
      INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
      VALUES (NULL, 'PAGO_GRUPAL_ANULADO', $1, $2)
    `, [`Placa ${cur.rows[0].placa} — comprobante ${cur.rows[0].comprobante} anulado (${fmtLog(cur.rows[0].valor)}) — Motivo: ${motivo}`, usuario]);

    res.json({ success: true, pago: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-PAGO-GRUPAL-ANULAR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/devoluciones/:id/anular ─────────────────────────
export const anularDevolucion = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario = getUser(req);
    if (!motivo || !String(motivo).trim()) return res.status(400).json({ success: false, error: 'El motivo de anulación es requerido.' });

    const cur = await pool.query(`SELECT * FROM dicorp_devoluciones WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Devolución no encontrada.' });
    if (cur.rows[0].anulado) return res.status(400).json({ success: false, error: 'Esta devolución ya fue anulada.' });

    const result = await pool.query(`
      UPDATE dicorp_devoluciones SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, String(motivo).trim(), usuario]);

    await pool.query(`
      INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
      VALUES (NULL, 'DEVOLUCION_ANULADA', $1, $2)
    `, [`Placa ${cur.rows[0].placa} — devolución anulada (${fmtLog(cur.rows[0].valor)}) — Motivo: ${motivo}`, usuario]);

    res.json({ success: true, devolucion: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-DEVOLUCION-ANULAR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /dicorp-legalizacion/sobrecostos/:id/anular ──────────────────────────
export const anularSobrecosto = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario = getUser(req);
    if (!motivo || !String(motivo).trim()) return res.status(400).json({ success: false, error: 'El motivo de anulación es requerido.' });

    const cur = await pool.query(`SELECT * FROM dicorp_sobrecostos WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Sobrecosto no encontrado.' });
    if (cur.rows[0].anulado) return res.status(400).json({ success: false, error: 'Este sobrecosto ya fue anulado.' });

    const result = await pool.query(`
      UPDATE dicorp_sobrecostos SET anulado = TRUE, anulado_motivo = $2, anulado_por = $3, anulado_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, String(motivo).trim(), usuario]);

    if (cur.rows[0].id_encabezado) {
      await pool.query(`
        INSERT INTO dicorp_legalizacion_log (id_encabezado, accion, observacion, usuario)
        VALUES ($1, 'SOBRECOSTO_ANULADO', $2, $3)
      `, [cur.rows[0].id_encabezado, `Sobrecosto (${cur.rows[0].status}) anulado (${fmtLog(cur.rows[0].valor)}) — Motivo: ${motivo}`, usuario]);
    }

    res.json({ success: true, sobrecosto: result.rows[0] });
  } catch (err: any) {
    console.error('[DICORP-SOBRECOSTO-ANULAR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

function fmtLog(v: any): string {
  const n = parseNum(v);
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}
