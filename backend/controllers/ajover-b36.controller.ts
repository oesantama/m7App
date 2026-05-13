import { Request, Response } from 'express';
import pool from '../config/database.js';
import * as XLSX from 'xlsx';

// ─── Garantizar tablas en primera llamada ─────────────────────────────────────
const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ajover_b36_encabezado (
      id          SERIAL PRIMARY KEY,
      os          TEXT,
      id_viaje    TEXT,
      fecha_carge DATE,
      placa       TEXT,
      conductor   TEXT,
      fecha_programado DATE,
      cant_clientes    INTEGER DEFAULT 0,
      nombre_ruta      TEXT,
      coordinador      TEXT,
      usuariocontrol   TEXT,
      fechacontrol     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      valor_flete      NUMERIC DEFAULT 0,
      client_id        TEXT,
      uploaded_by      TEXT,
      uploaded_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      inhouse_id       TEXT
    )
  `);
  await pool.query(`
    ALTER TABLE ajover_b36_encabezado ADD COLUMN IF NOT EXISTS id_viaje TEXT;
    ALTER TABLE ajover_b36_encabezado ADD COLUMN IF NOT EXISTS inhouse_id TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ajover_b36_detalle (
      id       SERIAL PRIMARY KEY,
      id_enca  INTEGER REFERENCES ajover_b36_encabezado(id) ON DELETE CASCADE,
      factura  TEXT,
      notas    TEXT,
      client_id TEXT
    )
  `);
  await pool.query(`
    ALTER TABLE ajover_b36_detalle ADD COLUMN IF NOT EXISTS volumen NUMERIC DEFAULT 0;
    ALTER TABLE ajover_b36_detalle ADD COLUMN IF NOT EXISTS peso NUMERIC DEFAULT 0;
    ALTER TABLE ajover_b36_detalle ADD COLUMN IF NOT EXISTS cubicaje NUMERIC DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ajover_b36_sobrecostos (
      id          SERIAL PRIMARY KEY,
      id_enca     INTEGER REFERENCES ajover_b36_encabezado(id) ON DELETE CASCADE,
      valor       NUMERIC DEFAULT 0,
      observacion TEXT,
      estado      TEXT DEFAULT 'PENDIENTE'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ajover_b36_log (
      id           SERIAL PRIMARY KEY,
      id_enca      INTEGER REFERENCES ajover_b36_encabezado(id) ON DELETE CASCADE,
      factura      TEXT,
      accion       TEXT,
      observacion  TEXT,
      usuario      TEXT,
      fecha        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_b36_enc_client  ON ajover_b36_encabezado (client_id);
    CREATE INDEX IF NOT EXISTS idx_b36_enc_fecha   ON ajover_b36_encabezado (fecha_carge DESC);
    CREATE INDEX IF NOT EXISTS idx_b36_det_id_enca ON ajover_b36_detalle (id_enca);
    CREATE INDEX IF NOT EXISTS idx_b36_log_id_enca ON ajover_b36_log (id_enca);
  `);
};

// ─── Parsear fecha tolerante ──────────────────────────────────────────────────
const parseDate = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    // dd/mm/yyyy or mm/dd/yyyy — assume dd/mm/yyyy (Colombian)
    const [a, b, c] = parts.map(Number);
    if (c > 1900) return `${c}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
    if (a > 1900) return `${a}-${String(b).padStart(2,'0')}-${String(c).padStart(2,'0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

// ─── POST /ajover-b36/upload ──────────────────────────────────────────────────
export const uploadAuditoriaB36 = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const clientId   = req.body?.clientId || req.query.clientId;
    const uploadedBy = (req as any).user?.id || 'SYSTEM';

    if (!clientId)  return res.status(400).json({ error: 'clientId es requerido.' });

    let encRows: any[] = [];
    let detRows: any[] = [];

    if (req.body.encRows && Array.isArray(req.body.encRows)) {
      encRows = req.body.encRows;
      detRows = Array.isArray(req.body.detRows) ? req.body.detRows : [];
    } else {
      if (!req.file) return res.status(400).json({ error: 'No se recibió archivo ni datos JSON.' });

      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });

      // Detectar hoja Encabezado (primera que coincida o la primera hoja)
      const encSheet = wb.Sheets[wb.SheetNames.find(n => /encabezado/i.test(n)) ?? wb.SheetNames[0]];
      const detSheet = wb.Sheets[wb.SheetNames.find(n => /detalle/i.test(n)) ?? wb.SheetNames[1]] || null;

      if (!encSheet) return res.status(400).json({ error: 'No se encontró la hoja de Encabezado.' });

      encRows = XLSX.utils.sheet_to_json(encSheet, { defval: null });
      detRows = detSheet ? XLSX.utils.sheet_to_json(detSheet, { defval: null }) : [];
    }

    if (encRows.length === 0) return res.status(400).json({ error: 'La hoja de Encabezado está vacía.' });

    const client = await pool.connect();
    const insertedIds: number[] = [];
    let detInserted = 0;

    try {
      await client.query('BEGIN');

      for (const row of encRows) {
        // Normalizar claves a minúsculas sin espacios
        const r: any = {};
        Object.keys(row).forEach(k => { r[k.toLowerCase().replace(/\s+/g, '_')] = row[k]; });

        const result = await client.query(`
          INSERT INTO ajover_b36_encabezado
            (os, id_viaje, fecha_carge, placa, conductor, fecha_programado, cant_clientes,
             nombre_ruta, coordinador, usuariocontrol, fechacontrol, valor_flete,
             client_id, uploaded_by, uploaded_at, inhouse_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15)
          RETURNING id
        `, [
          r.os          || r['os']           || null,
          r.id_viaje     || null,
          parseDate(r.fecha_carge || r.fecha_carge || null),
          r.placa        || null,
          r.conductor    || null,
          parseDate(r.fecha_programado || null),
          parseInt(r.cant_clientes) || 0,
          r.nombre_ruta  || null,
          r.coordinador  || null,
          r.usuariocontrol || null,
          parseDate(r.fechacontrol || null) || new Date().toISOString(),
          parseFloat(String(r.valor_flete || '0').replace(/[^0-9.]/g, '')) || 0,
          clientId,
          uploadedBy,
          r.inhouse_id   || null,
        ]);
        const encId = result.rows[0].id;
        insertedIds.push(encId);
      }

      // Detalles: puede venir en hoja separada (id_enca referencia posición) o en misma hoja
      if (detRows.length > 0) {
        for (let i = 0; i < detRows.length; i++) {
          const dr: any = {};
          Object.keys(detRows[i]).forEach(k => { dr[k.toLowerCase().replace(/\s+/g, '_')] = detRows[i][k]; });

          // id_enca puede ser un índice (1-based) o el OS del encabezado
          let encId: number | null = null;
          if (dr.id_enca) {
            const idx = parseInt(dr.id_enca);
            if (!isNaN(idx) && insertedIds[idx - 1]) {
              encId = insertedIds[idx - 1];
            }
          } else if (insertedIds.length === 1) {
            encId = insertedIds[0];
          } else {
            encId = insertedIds[Math.min(i, insertedIds.length - 1)];
          }

          if (!encId) continue;

          await client.query(`
            INSERT INTO ajover_b36_detalle (id_enca, factura, notas, volumen, peso, cubicaje, client_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            encId, 
            dr.factura || null, 
            dr.notas || dr.notes || null, 
            parseFloat(dr.volumen) || 0, 
            parseFloat(dr.peso) || 0, 
            parseFloat(dr.cubicaje) || 0, 
            clientId
          ]);
          detInserted++;
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        encabezados: insertedIds.length,
        detalles: detInserted,
        ids: insertedIds,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[B36-UPLOAD]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/encabezados ──────────────────────────────────────────────
export const getEncabezados = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { clientId, from, to, placa, os } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (clientId) { conditions.push(`client_id = $${p++}`); params.push(clientId); }
    if (from)     { conditions.push(`fecha_carge >= $${p++}`); params.push(from); }
    if (to)       { conditions.push(`fecha_carge <= $${p++}`); params.push(to); }
    if (placa)    { conditions.push(`UPPER(placa) LIKE $${p++}`); params.push(`%${String(placa).toUpperCase()}%`); }
    if (os)       { conditions.push(`UPPER(os) LIKE $${p++}`);    params.push(`%${String(os).toUpperCase()}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM ajover_b36_detalle d WHERE d.id_enca = e.id) AS cant_facturas
       FROM ajover_b36_encabezado e
       ${where}
       ORDER BY e.uploaded_at DESC, e.id DESC
       LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/detalle/:encId ──────────────────────────────────────────
export const getDetalle = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { encId } = req.params;
    const result = await pool.query(
      `SELECT * FROM ajover_b36_detalle WHERE id_enca = $1 ORDER BY id`,
      [encId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/export/:encId ───────────────────────────────────────────
export const exportAuditoriaExcel = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { encId } = req.params;

    const encRes = await pool.query(`SELECT * FROM ajover_b36_encabezado WHERE id = $1`, [encId]);
    if (encRes.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });

    const detRes = await pool.query(`SELECT * FROM ajover_b36_detalle WHERE id_enca = $1 ORDER BY id`, [encId]);

    const enc = encRes.rows[0];
    const fmtDate = (d: any) => {
      if (!d) return null;
      const dateObj = new Date(d);
      return isNaN(dateObj.getTime()) ? null : dateObj;
    };

    // Hoja Encabezado
    const encData = [{
      OS: enc.os,
      'FECHA CARGE': fmtDate(enc.fecha_carge),
      PLACA: enc.placa,
      CONDUCTOR: enc.conductor,
      'FECHA PROGRAMADO': fmtDate(enc.fecha_programado),
      'CANT. CLIENTES': enc.cant_clientes,
      'NOMBRE RUTA': enc.nombre_ruta,
      COORDINADOR: enc.coordinador,
      'USUARIO CONTROL': enc.usuariocontrol,
      'FECHA CONTROL': fmtDate(enc.fechacontrol),
      'VALOR FLETE': enc.valor_flete,
    }];

    // Hoja Detalle
    const detData = detRes.rows.map(d => ({
      'ID ENCA': enc.os || enc.id,
      FACTURA: d.factura,
      NOTAS: d.notas,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(encData, { cellDates: true }), 'Encabezado');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detData.length ? detData : [{}], { cellDates: true }), 'Detalle');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `ajover_b36_${(enc.os || enc.id).toString().replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/export-all ──────────────────────────────────────────────
export const exportAllAuditoriaExcel = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { clientId, from, to, placa, os } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (clientId) { conditions.push(`e.client_id = $${p++}`); params.push(clientId); }
    if (from)     { conditions.push(`e.fecha_carge >= $${p++}`); params.push(from); }
    if (to)       { conditions.push(`e.fecha_carge <= $${p++}`); params.push(to); }
    if (placa)    { conditions.push(`UPPER(e.placa) LIKE $${p++}`); params.push(`%${String(placa).toUpperCase()}%`); }
    if (os)       { conditions.push(`UPPER(e.os) LIKE $${p++}`);    params.push(`%${String(os).toUpperCase()}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const encRes = await pool.query(
      `SELECT e.*,
              u1.name AS inhouse_name,
              u2.name AS creator_name
       FROM ajover_b36_encabezado e
       LEFT JOIN users u1 ON e.inhouse_id = u1.id::text OR e.inhouse_id = u1.email
       LEFT JOIN users u2 ON e.uploaded_by = u2.id::text OR e.uploaded_by = u2.email
       ${where}
       ORDER BY e.uploaded_at DESC, e.id DESC
       LIMIT 2000`,
      params
    );

    if (encRes.rows.length === 0) return res.status(404).json({ error: 'No se encontraron registros para exportar.' });

    const encIds = encRes.rows.map((r: any) => r.id);
    const detRes = await pool.query(
      `SELECT d.*, e.os as enc_os FROM ajover_b36_detalle d
       JOIN ajover_b36_encabezado e ON d.id_enca = e.id
       WHERE d.id_enca = ANY($1)
       ORDER BY d.id_enca, d.id`,
      [encIds]
    );

    const fmtDate = (d: any) => {
      if (!d) return null;
      const dateObj = new Date(d);
      return isNaN(dateObj.getTime()) ? null : dateObj;
    };

    // Hoja Encabezados
    const encData = encRes.rows.map((enc: any) => ({
      OS: enc.os,
      'ID VIAJE': enc.id_viaje || '',
      'FECHA CARGE': fmtDate(enc.fecha_carge),
      PLACA: enc.placa,
      CONDUCTOR: enc.conductor,
      'FECHA PROGRAMADO': fmtDate(enc.fecha_programado),
      'CANT. CLIENTES': enc.cant_clientes,
      'NOMBRE RUTA': enc.nombre_ruta,
      'USUARIO INHOUSE': enc.inhouse_name || enc.inhouse_id || '',
      'USUARIO CREACIÓN': enc.creator_name || enc.usercreated || '',
      'FECHA CARGA REGISTRO': fmtDate(enc.uploaded_at),
      'VALOR FLETE': enc.valor_flete,
    }));

    // Hoja Detalles
    const detData = detRes.rows.map((d: any) => ({
      'OS ENCA': d.enc_os,
      FACTURA: d.factura,
      VOLUMEN: d.volumen || 0,
      PESO: d.peso || 0,
      CUBICAJE: d.cubicaje || 0,
      NOTAS: d.notes || d.notas || '',
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(encData, { cellDates: true }), 'Encabezados');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detData.length ? detData : [{}], { cellDates: true }), 'Detalles');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `auditoria_completa_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/sobrecostos/:encId ───────────────────────────────────────
export const getSobrecostos = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { encId } = req.params;
    const result = await pool.query(
      `SELECT * FROM ajover_b36_sobrecostos WHERE id_enca = $1 ORDER BY id`,
      [encId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /ajover-b36/planilla/:id ─────────────────────────────────────────────
export const updatePlanilla = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await ensureTables();
    const { id } = req.params;
    const { valor_flete, sobrecostos, placa, conductor, change_notes } = req.body;

    await client.query('BEGIN');

    // Obtener datos actuales para comparar y auditar
    const currentRes = await client.query(
      `SELECT placa, conductor, valor_flete FROM ajover_b36_encabezado WHERE id = $1`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Planilla no encontrada.' });
    }
    const current = currentRes.rows[0];
    const user = (req as any).user?.username || (req as any).user?.email || 'sistema';

    // 1. Obtener valores destino
    const targetPlaca = placa !== undefined ? String(placa).trim() : current.placa;
    const targetConductor = conductor !== undefined ? String(conductor).trim() : current.conductor;

    const hasPlacaChanged = targetPlaca !== current.placa;
    const hasConductorChanged = targetConductor !== current.conductor;

    // 2. Validaciones de Reglas de Negocio
    if (hasPlacaChanged && !hasConductorChanged) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Si cambia la placa del vehículo, debe obligatoriamente cambiar el conductor.' });
    }

    if ((hasPlacaChanged || hasConductorChanged) && (!change_notes || !String(change_notes).trim())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Debe ingresar un motivo o notas para registrar el cambio de placa y/o conductor.' });
    }

    // 3. Actualizar el flete, placa y conductor del encabezado
    await client.query(
      `UPDATE ajover_b36_encabezado 
       SET valor_flete = $1, placa = $2, conductor = $3 
       WHERE id = $4`,
      [valor_flete, targetPlaca, targetConductor, id]
    );

    // 4. Registrar logs de auditoría según corresponda
    const notes = change_notes && String(change_notes).trim() ? ` Motivo: ${String(change_notes).trim()}` : '';
    
    if (hasPlacaChanged) {
      await client.query(
        `INSERT INTO ajover_b36_log (id_enca, factura, accion, observacion, usuario)
         VALUES ($1, NULL, 'CAMBIO_PLACA', $2, $3)`,
        [id, `Placa cambió de "${current.placa}" a "${targetPlaca}".${notes}`, user]
      );
    }

    if (hasConductorChanged) {
      await client.query(
        `INSERT INTO ajover_b36_log (id_enca, factura, accion, observacion, usuario)
         VALUES ($1, NULL, 'CAMBIO_CONDUCTOR', $2, $3)`,
        [id, `Conductor cambió de "${current.conductor}" a "${targetConductor}".${notes}`, user]
      );
    }

    // El flete y sobrecostos se guardan de manera independiente sin requerir notas
    if (parseFloat(valor_flete) !== parseFloat(current.valor_flete)) {
      await client.query(
        `INSERT INTO ajover_b36_log (id_enca, factura, accion, observacion, usuario)
         VALUES ($1, NULL, 'CAMBIO_FLETE', $2, $3)`,
        [id, `Valor de flete cambió de $${current.valor_flete} a $${valor_flete}.${notes || ' (Cambio independiente)'}`, user]
      );
    }

    // 4. Si se suministra la lista de sobrecostos
    if (Array.isArray(sobrecostos)) {
      const incomingIds = sobrecostos.filter(s => s.id).map(s => s.id);

      // Eliminar los sobrecostos que ya no están en la lista
      if (incomingIds.length > 0) {
        await client.query(
          `DELETE FROM ajover_b36_sobrecostos WHERE id_enca = $1 AND id != ANY($2)`,
          [id, incomingIds]
        );
      } else {
        await client.query(
          `DELETE FROM ajover_b36_sobrecostos WHERE id_enca = $1`,
          [id]
        );
      }

      // Insertar o actualizar cada sobrecosto
      for (const s of sobrecostos) {
        if (s.id) {
          await client.query(
            `UPDATE ajover_b36_sobrecostos 
             SET valor = $1, observacion = $2, estado = $3 
             WHERE id = $4 AND id_enca = $5`,
            [s.valor, s.observacion, s.estado, s.id, id]
          );
        } else {
          await client.query(
            `INSERT INTO ajover_b36_sobrecostos (id_enca, valor, observacion, estado)
             VALUES ($1, $2, $3, $4)`,
            [id, s.valor, s.observacion, s.estado || 'PENDIENTE']
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// ─── DELETE /ajover-b36/encabezado/:id ────────────────────────────────────────
export const deleteEncabezado = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    await pool.query(`DELETE FROM ajover_b36_encabezado WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /ajover-b36/detalle ─────────────────────────────────────────────────
export const addDetalle = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id_enca, factura, volumen, peso, cubicaje, notas, client_id } = req.body;
    if (!id_enca || !factura) {
      return res.status(400).json({ error: 'id_enca y factura son requeridos.' });
    }
    const result = await pool.query(`
      INSERT INTO ajover_b36_detalle (id_enca, factura, volumen, peso, cubicaje, notas, client_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id_enca,
      factura,
      parseFloat(volumen) || 0,
      parseFloat(peso) || 0,
      parseFloat(cubicaje) || 0,
      notas || null,
      client_id || null
    ]);

    // Actualizar cant_clientes en el encabezado
    await pool.query(`
      UPDATE ajover_b36_encabezado
      SET cant_clientes = (SELECT COUNT(*) FROM ajover_b36_detalle WHERE id_enca = $1)
      WHERE id = $1
    `, [id_enca]);

    // Registrar log
    const user = (req as any).user?.username || (req as any).user?.email || 'sistema';
    await pool.query(`
      INSERT INTO ajover_b36_log (id_enca, factura, accion, observacion, usuario)
      VALUES ($1, $2, 'ADICION', $3, $4)
    `, [id_enca, factura, 'Adición manual de factura', user]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /ajover-b36/detalle/:id ───────────────────────────────────────────
export const deleteDetalle = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const reason = String(req.query.reason || 'Sin observación');

    const detRes = await pool.query(`SELECT id_enca, factura FROM ajover_b36_detalle WHERE id = $1`, [id]);
    if (detRes.rows.length === 0) {
      return res.status(404).json({ error: 'Factura no encontrada.' });
    }
    const { id_enca, factura } = detRes.rows[0];

    // Registrar log
    const user = (req as any).user?.username || (req as any).user?.email || 'sistema';
    await pool.query(`
      INSERT INTO ajover_b36_log (id_enca, factura, accion, observacion, usuario)
      VALUES ($1, $2, 'ELIMINACION', $3, $4)
    `, [id_enca, factura, reason, user]);

    await pool.query(`DELETE FROM ajover_b36_detalle WHERE id = $1`, [id]);

    // Actualizar cant_clientes en el encabezado
    await pool.query(`
      UPDATE ajover_b36_encabezado
      SET cant_clientes = (SELECT COUNT(*) FROM ajover_b36_detalle WHERE id_enca = $1)
      WHERE id = $1
    `, [id_enca]);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /ajover-b36/logs/:encId ──────────────────────────────────────────────
export const getLogs = async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const { encId } = req.params;
    const result = await pool.query(
      `SELECT * FROM ajover_b36_log WHERE id_enca = $1 ORDER BY fecha DESC`,
      [encId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


