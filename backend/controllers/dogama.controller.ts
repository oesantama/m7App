import { Request, Response } from 'express';
import pool from '../config/database.js';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { sendEmail } from '../services/notification.service.js';

// ── CONFECCIONISTAS ───────────────────────────────────────────────────────────

export const getConfeccionistas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT dc.*,
             e.name     AS estado_nombre,
             cc.nombre  AS ciudad_nombre,
             u.name     AS usuario_nombre,
             ua.name    AS usuario_actualizacion_nombre
      FROM dogama_confeccionistas dc
      LEFT JOIN estados      e  ON e.id  = dc.estado_id
      LEFT JOIN cfg_ciudades cc ON cc.id = dc.ciudad_id
      LEFT JOIN users        u  ON u.id  = dc.usuariocreacion
      LEFT JOIN users        ua ON ua.id = dc.usuarioactualizacion
      ORDER BY dc.descripcion_conf ASC
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createConfeccionista = async (req: Request, res: Response) => {
  const { descripcion_conf, direccion, ciudad, ciudad_id, estado_id, usuariocreacion, telefono, correo } = req.body;
  if (!descripcion_conf) {
    return res.status(400).json({ error: 'descripcion_conf es obligatorio' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO dogama_confeccionistas
         (descripcion_conf, direccion, ciudad, ciudad_id, estado_id, usuariocreacion, telefono, correo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [descripcion_conf.trim(), direccion.trim(), ciudad || null, ciudad_id || null,
       estado_id || 'EST-01', usuariocreacion || null, telefono || null, correo || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un confeccionista con ese nombre y dirección' });
    }
    res.status(500).json({ error: e.message });
  }
};

export const bulkCreateConfeccionistas = async (req: Request, res: Response) => {
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de filas' });
  }
  const inserted: any[] = [];
  const duplicates: any[] = [];
  const errors: any[] = [];

  for (const row of rows) {
    const conf = (row.Confeccionista || row.descripcion_conf || '').trim();
    const dir  = (row.direccion || row.Direccion || '').trim();
    if (!conf || !dir) { errors.push({ row, reason: 'Faltan campos requeridos' }); continue; }
    const ciudad  = (row.CIUDAD   || row.Ciudad   || row.ciudad   || '').trim() || null;
    const telefono = (row.Telefono || row.telefono || row.TELEFONO || '').trim() || null;
    const correo  = (row.correo   || row.Correo   || row.email    || '').trim() || null;
    try {
      const r = await pool.query(
        `INSERT INTO dogama_confeccionistas
           (descripcion_conf, direccion, ciudad, telefono, correo, estado_id, usuariocreacion)
         VALUES ($1,$2,$3,$4,$5,'EST-01',$6)
         ON CONFLICT (descripcion_conf, direccion) DO NOTHING
         RETURNING *`,
        [conf, dir, ciudad, telefono, correo, usuariocreacion || null]
      );
      if (r.rowCount && r.rowCount > 0) inserted.push(r.rows[0]);
      else duplicates.push({ conf, dir });
    } catch (e: any) {
      errors.push({ row, reason: e.message });
    }
  }

  res.json({ inserted: inserted.length, duplicates: duplicates.length, errors: errors.length, data: inserted });
};

export const updateConfeccionista = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { descripcion_conf, direccion, ciudad, ciudad_id, estado_id, telefono, correo, usuarioactualizacion } = req.body;
  try {
    const result = await pool.query(
      `UPDATE dogama_confeccionistas
       SET descripcion_conf=$1, direccion=$2, ciudad=$3, ciudad_id=$4, estado_id=$5, telefono=$6, correo=$7,
           fecha_actualizacion=(NOW() AT TIME ZONE 'America/Bogota'), usuarioactualizacion=$8
       WHERE id=$9 RETURNING *`,
      [descripcion_conf, direccion, ciudad || null, ciudad_id || null,
       estado_id || 'EST-01', telefono || null, correo || null, usuarioactualizacion || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un confeccionista con ese nombre y dirección' });
    res.status(500).json({ error: e.message });
  }
};

export const deleteConfeccionista = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM dogama_confeccionistas WHERE id=$1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const resolveCiudadBulk = async (req: Request, res: Response) => {
  const { ciudad_text, ciudad_id } = req.body;
  if (!ciudad_text || !ciudad_id) return res.status(400).json({ error: 'ciudad_text y ciudad_id son requeridos' });
  try {
    const r = await pool.query(
      `UPDATE dogama_confeccionistas SET ciudad_id=$1 WHERE UPPER(TRIM(ciudad))=UPPER(TRIM($2)) AND ciudad_id IS NULL`,
      [ciudad_id, ciudad_text]
    );
    res.json({ updated: r.rowCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── CATÁLOGOS GENÉRICOS (Marcas + Tipos Prenda) ───────────────────────────────
type CatalogTable = 'dogama_marcas' | 'dogama_tipos_prenda' | 'dogama_tipos_oc';

const ALLOWED_TABLES: CatalogTable[] = ['dogama_marcas', 'dogama_tipos_prenda', 'dogama_tipos_oc'];

const assertTable = (t: string): t is CatalogTable => ALLOWED_TABLES.includes(t as any);

export const getCatalog = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  try {
    const r = await pool.query(
      `SELECT t.*, e.name AS estado_nombre, u.name AS usuario_nombre, ua.name AS usuario_actualizacion_nombre
       FROM ${table} t
       LEFT JOIN estados e  ON e.id  = t.estado_id
       LEFT JOIN users   u  ON u.id  = t.usuariocreacion
       LEFT JOIN users   ua ON ua.id = t.usuarioactualizacion
       ORDER BY t.descripcion ASC`
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const createCatalogItem = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  const { descripcion, estado_id, usuariocreacion, accion_importacion } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'descripcion es obligatorio' });
  const estadoId = estado_id || 'EST-01';
  try {
    let r;
    if (table === 'dogama_tipos_oc') {
      r = await pool.query(
        `INSERT INTO ${table} (descripcion, estado_id, usuariocreacion, accion_importacion) VALUES ($1,$2,$3,$4) RETURNING *`,
        [descripcion.trim(), estadoId, usuariocreacion || null, accion_importacion || 'valida']
      );
    } else {
      r = await pool.query(
        `INSERT INTO ${table} (descripcion, estado_id, usuariocreacion) VALUES ($1,$2,$3) RETURNING *`,
        [descripcion.trim(), estadoId, usuariocreacion || null]
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esa descripción' });
    res.status(500).json({ error: e.message });
  }
};

export const bulkCreateCatalog = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Se requiere un array de filas' });
  let inserted = 0; let duplicates = 0; let errors = 0;
  for (const row of rows) {
    const desc = (row.descripcion || row.Descripcion || row.DESCRIPCION || '').trim();
    if (!desc) { errors++; continue; }
    try {
      const r = await pool.query(
        `INSERT INTO ${table} (descripcion, estado_id, usuariocreacion) VALUES ($1,'EST-01',$2) ON CONFLICT (descripcion) DO NOTHING RETURNING id`,
        [desc, usuariocreacion || null]
      );
      if (r.rowCount && r.rowCount > 0) inserted++; else duplicates++;
    } catch { errors++; }
  }
  res.json({ inserted, duplicates, errors });
};

export const updateCatalogItem = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  const { id } = req.params;
  const { descripcion, estado_id, usuarioactualizacion, accion_importacion } = req.body;
  try {
    let r;
    if (table === 'dogama_tipos_oc') {
      r = await pool.query(
        `UPDATE ${table} SET descripcion=$1, estado_id=$2,
             fecha_actualizacion=(NOW() AT TIME ZONE 'America/Bogota'), usuarioactualizacion=$3,
             accion_importacion=$4
         WHERE id=$5 RETURNING *`,
        [descripcion, estado_id || 'EST-01', usuarioactualizacion || null, accion_importacion || 'valida', id]
      );
    } else {
      r = await pool.query(
        `UPDATE ${table} SET descripcion=$1, estado_id=$2,
             fecha_actualizacion=(NOW() AT TIME ZONE 'America/Bogota'), usuarioactualizacion=$3
         WHERE id=$4 RETURNING *`,
        [descripcion, estado_id || 'EST-01', usuarioactualizacion || null, id]
      );
    }
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esa descripción' });
    res.status(500).json({ error: e.message });
  }
};

export const deleteCatalogItem = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  const { id } = req.params;
  try {
    const r = await pool.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

// ── DESPACHOS ─────────────────────────────────────────────────────────────────

const DESPACHOS_SELECT = `
  SELECT
    d.*,
    dc.descripcion_conf AS confeccionista_nombre,
    dm.descripcion AS marca_nombre,
    dtp.descripcion      AS tipo_prenda_nombre,
    e.name               AS estado_nombre
  FROM dogama_despachos d
  LEFT JOIN dogama_confeccionistas dc  ON dc.id  = d.confeccionista_id
  LEFT JOIN dogama_marcas          dm  ON dm.id  = d.marca_id
  LEFT JOIN dogama_tipos_prenda    dtp ON dtp.id = d.tipo_prenda_id
  LEFT JOIN estados                e   ON e.id   = d.estado_id
`;

export const getDespachos = async (req: Request, res: Response) => {
  const assignable = req.query.assignable === 'true';
  const where = assignable ? `WHERE d.estado_id <> 'EST-10'` : '';
  try {
    const result = await pool.query(`${DESPACHOS_SELECT} ${where} ORDER BY d.fecha DESC, d.id DESC LIMIT 2000`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const bulkCreateDespachos = async (req: Request, res: Response) => {
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de filas' });

  let inserted = 0; let duplicates = 0; let errors = 0;

  for (const row of rows) {
    try {
      const r = await pool.query(
        `INSERT INTO dogama_despachos
           (fecha, orden_cargue, confeccionista_id, orden_servicio,
            marca_id, referencia, lote, unidades,
            tipo_prenda_id, estado_id, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'EST-03',$10)
         ON CONFLICT ON CONSTRAINT uq_despacho DO NOTHING
         RETURNING id`,
        [
          row.fecha || null,
          row.orden_cargue || null,
          row.confeccionista_id || null,
          row.orden_servicio || null,
          row.marca_id || null,
          row.referencia || null,
          row.lote || null,
          row.unidades ? Number(row.unidades) : null,
          row.tipo_prenda_id || null,
          usuariocreacion || null,
        ]
      );
      if (r.rowCount && r.rowCount > 0) inserted++; else duplicates++;
    } catch { errors++; }
  }

  res.json({ inserted, duplicates, errors });
};

export const updateDespachoEstado = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado_id } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dogama_despachos SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const deleteDespacho = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const r = await pool.query('DELETE FROM dogama_despachos WHERE id=$1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

// ── CITAS / RECOGIDAS ─────────────────────────────────────────────────────────

const CITAS_SELECT = `
  SELECT
    c.*,
    dm.descripcion       AS marca_nombre,
    dc.descripcion_conf  AS proveedor_nombre,
    doc.descripcion      AS tipo_oc_nombre,
    e.name               AS estado_nombre
  FROM dogama_citas_recogidas c
  LEFT JOIN dogama_marcas          dm  ON dm.id  = c.marca_id
  LEFT JOIN dogama_confeccionistas dc  ON dc.id  = c.proveedor_id
  LEFT JOIN dogama_tipos_oc        doc ON doc.id = c.tipo_oc_id
  LEFT JOIN estados                e   ON e.id   = c.estado_id
`;

export const getCitasRecogidas = async (req: Request, res: Response) => {
  const assignable = req.query.assignable === 'true';
  const where = assignable ? `WHERE c.estado_id <> 'EST-10'` : '';
  try {
    const result = await pool.query(`${CITAS_SELECT} ${where} ORDER BY c.fecha DESC, c.id DESC LIMIT 2000`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const bulkCreateCitas = async (req: Request, res: Response) => {
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de filas' });

  let inserted = 0; let duplicates = 0; let errors = 0;

  for (const row of rows) {
    try {
      const r = await pool.query(
        `INSERT INTO dogama_citas_recogidas
           (fecha, turno, hora_inicio, hora_fin,
            marca_id, referencia, color, lote,
            mesa, cantidad, proveedor_id, numero_documento,
            tipo_oc_id, estado_id, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'EST-03',$14)
         ON CONFLICT ON CONSTRAINT uq_cita DO NOTHING
         RETURNING id`,
        [
          row.fecha || null,
          row.turno || null,
          row.hora_inicio || null,
          row.hora_fin || null,
          row.marca_id || null,
          row.referencia || null,
          row.color || null,
          row.lote || null,
          row.mesa != null ? Number(row.mesa) : null,
          row.cantidad != null ? Number(row.cantidad) : null,
          row.proveedor_id || null,
          row.numero_documento || null,
          row.tipo_oc_id || null,
          usuariocreacion || null,
        ]
      );
      if (r.rowCount && r.rowCount > 0) inserted++; else duplicates++;
    } catch { errors++; }
  }

  res.json({ inserted, duplicates, errors });
};

export const updateCitaEstado = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado_id } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dogama_citas_recogidas SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const patchCita = async (req: Request, res: Response) => {
  const { id } = req.params;
  const ALLOWED = ['estado_id', 'hora_inicio', 'hora_fin', 'turno', 'tipo_oc_id'];
  const entries = Object.entries(req.body).filter(([k]) => ALLOWED.includes(k));
  if (entries.length === 0) return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
  const sets = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
  const vals = entries.map(([, v]) => v);
  try {
    const r = await pool.query(`UPDATE dogama_citas_recogidas SET ${sets} WHERE id=$${vals.length + 1} RETURNING *`, [...vals, id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const deleteCita = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const r = await pool.query('DELETE FROM dogama_citas_recogidas WHERE id=$1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

// ── EMAIL OAUTH CONFIG ────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CALLBACK_URI = `${BACKEND_URL}/api/dogama/email-config/callback`;

export const getEmailConfig = async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      'SELECT id, provider, email, display_name, is_active, created_at FROM dogama_email_config ORDER BY created_at DESC'
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const initGmailAuth = (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'GOOGLE_CLIENT_ID no configurado en el servidor' });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK_URI,
    response_type: 'code',
    scope: 'https://mail.google.com/ email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: 'gmail',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const initOutlookAuth = (req: Request, res: Response) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'MICROSOFT_CLIENT_ID no configurado en el servidor' });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK_URI,
    response_type: 'code',
    scope: 'https://graph.microsoft.com/Mail.Send offline_access User.Read',
    state: 'outlook',
  });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const closeHtml = (success: boolean, provider: string, email = '', name = '', errMsg = '') => `
<!DOCTYPE html><html><head><title>Vinculación</title></head><body>
<script>
  try {
    window.opener && window.opener.postMessage({
      type: 'DOGAMA_OAUTH_${success ? 'SUCCESS' : 'ERROR'}',
      provider: '${provider}', email: '${email}', name: '${name}', error: '${errMsg}'
    }, '*');
  } catch(e){}
  setTimeout(() => window.close(), 800);
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:40px">
  ${success ? '✅ Vinculado correctamente. Cerrando…' : `❌ Error: ${errMsg}`}
</p></body></html>`;

  if (error) return res.send(closeHtml(false, state || '', '', '', error));

  try {
    let userEmail = ''; let displayName = ''; let refreshToken = ''; let accessToken = ''; let expiresIn = 0;

    if (state === 'gmail') {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: CALLBACK_URI, grant_type: 'authorization_code',
      }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const { data: info } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${data.access_token}` } });

      userEmail = info.email; displayName = info.name || info.email;
      refreshToken = data.refresh_token; accessToken = data.access_token; expiresIn = data.expires_in || 3600;

    } else { // outlook
      const { data } = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          code, client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          redirect_uri: CALLBACK_URI, grant_type: 'authorization_code',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access User.Read',
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const { data: info } = await axios.get('https://graph.microsoft.com/v1.0/me',
        { headers: { Authorization: `Bearer ${data.access_token}` } });

      userEmail = info.mail || info.userPrincipalName; displayName = info.displayName || userEmail;
      refreshToken = data.refresh_token; accessToken = data.access_token; expiresIn = data.expires_in || 3600;
    }

    await pool.query(`
      INSERT INTO dogama_email_config (provider, email, display_name, refresh_token, access_token, token_expires_at, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      ON CONFLICT (provider) DO UPDATE SET
        email=$2, display_name=$3, refresh_token=$4, access_token=$5,
        token_expires_at=$6, is_active=true, created_at=NOW()`,
      [state, userEmail, displayName, refreshToken, accessToken,
        new Date(Date.now() + expiresIn * 1000)]);

    res.send(closeHtml(true, state, userEmail, displayName));
  } catch (e: any) {
    res.send(closeHtml(false, state || '', '', '', e.message));
  }
};

export const deleteEmailConfig = async (req: Request, res: Response) => {
  const { provider } = req.params;
  try {
    await pool.query('DELETE FROM dogama_email_config WHERE provider=$1', [provider]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const testEmailSend = async (req: Request, res: Response) => {
  const { provider } = req.params;
  try {
    const r = await pool.query('SELECT * FROM dogama_email_config WHERE provider=$1 AND is_active=true', [provider]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'No hay cuenta vinculada para este proveedor' });
    const cfg = r.rows[0];

    if (provider === 'gmail') {
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: cfg.email,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: cfg.refresh_token,
          accessToken: cfg.access_token,
        } as any,
      });
      await transport.sendMail({
        from: `"Dogama M7" <${cfg.email}>`,
        to: cfg.email,
        subject: '✅ Correo de prueba - Dogama M7',
        html: `<p>El correo <strong>${cfg.email}</strong> está correctamente vinculado a Dogama M7.</p>`,
      });
    } else {
      // Refresh Microsoft token
      const { data: tokenData } = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: cfg.refresh_token,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', {
        message: {
          subject: '✅ Correo de prueba - Dogama M7',
          body: { contentType: 'HTML', content: `<p>El correo <strong>${cfg.email}</strong> está correctamente vinculado a Dogama M7.</p>` },
          toRecipients: [{ emailAddress: { address: cfg.email } }],
        },
      }, { headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' } });
    }

    res.json({ success: true, message: `Correo de prueba enviado a ${cfg.email}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── ASIGNACIONES ACTIVAS DE FLOTA ─────────────────────────────────────────────

export const getActiveFleetAssignments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id         AS assignment_id,
        a.vehicle_id,
        v.plate,
        v.brand      AS vehicle_brand,
        a.driver_id,
        d.name       AS driver_name,
        a.client_id,
        cl.name      AS client_name
      FROM assignments a
      JOIN vehicles v  ON v.id  = a.vehicle_id
      JOIN drivers  d  ON d.id  = a.driver_id
      JOIN clients  cl ON cl.id = a.client_id
      WHERE a.is_active = true
      ORDER BY cl.name, v.plate
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── PLANILLAS HISTORIAL ───────────────────────────────────────────────────────

export const createPlanillaHistorial = async (req: Request, res: Response) => {
  const {
    vehicle_id, remesa, manifiesto, valor_cxc, valor_cxp,
    intermediacion, items, usuario_creacion, fecha,
  } = req.body;
  if (!vehicle_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'vehicle_id e items son obligatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDonamaTables();

    // Derivar conductor y cliente desde la asignación activa
    const ar = await client.query(
      `SELECT a.driver_id, a.client_id FROM assignments a WHERE a.vehicle_id=$1 AND a.is_active=true LIMIT 1`,
      [vehicle_id]
    );
    const conductor_id = ar.rows[0]?.driver_id || null;
    const client_id   = ar.rows[0]?.client_id  || null;
    const fechaVal    = fecha || new Date().toLocaleDateString('en-CA');

    // 1. Crear encabezado de ruta
    const encR = await client.query(
      `INSERT INTO dogama_enc_planillas_historial
         (fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
          valor_cxc, valor_cxp, intermediacion, estado_id, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'EST-01',$10)
       RETURNING *`,
      [
        fechaVal, vehicle_id, conductor_id, client_id,
        remesa || null, manifiesto || null,
        valor_cxc  != null ? Number(valor_cxc)  : null,
        valor_cxp  != null ? Number(valor_cxp)  : null,
        intermediacion != null ? Number(intermediacion) : null,
        usuario_creacion || null,
      ]
    );
    const enc = encR.rows[0];

    // 2. Insertar ítems (un registro por despacho/cita)
    const inserted: any[] = [];
    const despIds: number[] = [];
    const citaIds: number[] = [];

    for (const item of items as Array<{ tipo: 'despacho' | 'cita'; id: number }>) {
      const r = await client.query(
        `INSERT INTO dogama_planillas_historial
           (enc_id, tipo, despacho_id, cita_id, estado_id, usuario_creacion)
         VALUES ($1,$2,$3,$4,'EST-01',$5)
         RETURNING *`,
        [
          enc.id, item.tipo,
          item.tipo === 'despacho' ? item.id : null,
          item.tipo === 'cita'     ? item.id : null,
          usuario_creacion || null,
        ]
      );
      inserted.push({ ...r.rows[0], enc_id: enc.id });
      if (item.tipo === 'despacho') despIds.push(item.id);
      else citaIds.push(item.id);
    }

    if (despIds.length > 0)
      await client.query(`UPDATE dogama_despachos SET estado_id='EST-10' WHERE id=ANY($1::int[])`, [despIds]);
    if (citaIds.length > 0)
      await client.query(`UPDATE dogama_citas_recogidas SET estado_id='EST-10' WHERE id=ANY($1::int[])`, [citaIds]);

    await client.query('COMMIT');

    // Sync TDM manifesto (non-blocking, after commit)
    syncTdmManifiesto(enc).catch(() => {});

    res.status(201).json({ enc, inserted: inserted.length, rows: inserted });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};

export const patchPlanillaHistorial = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    estado_id, motivo_cancelacion, tipo_cancelacion,
    user_id, user_nombre,
  } = req.body;

  // Sólo cancelación se maneja aquí; los campos de encabezado van a patchEncPlanilla
  if (!estado_id) return res.status(400).json({ error: 'estado_id es obligatorio' });

  const dbClient = await pool.connect();
  try {
    const item = await dbClient.query(
      `SELECT * FROM dogama_planillas_historial WHERE id=$1`, [id]
    );
    if (item.rowCount === 0) { res.status(404).json({ error: 'No encontrado' }); return; }
    const row = item.rows[0];
    const prevEstado = row.estado_id;

    await dbClient.query('BEGIN');

    // Actualizar ítem
    const r = await dbClient.query(
      `UPDATE dogama_planillas_historial
       SET estado_id=$1, motivo_cancelacion=$2, tipo_cancelacion=$3
       WHERE id=$4 RETURNING *`,
      [estado_id, motivo_cancelacion || null, tipo_cancelacion || null, id]
    );
    const updated = r.rows[0];

    // Si se cancela, gestionar el despacho/cita según tipo_cancelacion
    if (estado_id === 'EST-16' && prevEstado !== 'EST-16') {
      if (tipo_cancelacion === 'reasignar') {
        // Devolver a pendiente para que pueda asignarse otra vez
        if (row.despacho_id)
          await dbClient.query(`UPDATE dogama_despachos SET estado_id='EST-01' WHERE id=$1`, [row.despacho_id]);
        if (row.cita_id)
          await dbClient.query(`UPDATE dogama_citas_recogidas SET estado_id='EST-01' WHERE id=$1`, [row.cita_id]);
      } else if (tipo_cancelacion === 'definitivo') {
        // Cancelar definitivamente el despacho/cita
        if (row.despacho_id)
          await dbClient.query(`UPDATE dogama_despachos SET estado_id='EST-16' WHERE id=$1`, [row.despacho_id]);
        if (row.cita_id)
          await dbClient.query(`UPDATE dogama_citas_recogidas SET estado_id='EST-16' WHERE id=$1`, [row.cita_id]);
      }

      await logAudit({
        enc_id: row.enc_id,
        planilla_id: row.id,
        action_type: tipo_cancelacion === 'definitivo' ? 'cancel_definitivo' : 'cancel_reasignar',
        user_id: user_id ?? null,
        user_nombre: user_nombre ?? null,
        old_value: { estado_id: prevEstado },
        new_value: { estado_id, motivo: motivo_cancelacion ?? null, tipo_cancelacion },
        notes: motivo_cancelacion ?? null,
      });
    }

    await dbClient.query('COMMIT');
    res.json(updated);
  } catch (e: any) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    dbClient.release();
  }
};

export const patchEncPlanilla = async (req: Request, res: Response) => {
  const { id } = req.params;
  const ALLOWED = ['remesa','manifiesto','valor_cxc','valor_cxp','intermediacion','estado_id'];
  const entries = Object.entries(req.body).filter(([k]) => ALLOWED.includes(k));
  if (entries.length === 0) return res.status(400).json({ error: 'Sin campos válidos' });
  const sets = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
  const vals = entries.map(([, v]) => v);
  try {
    const r = await pool.query(
      `UPDATE dogama_enc_planillas_historial SET ${sets} WHERE id=$${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Encabezado no encontrado' });
    const updated = r.rows[0];
    // Sync TDM manifiesto if relevant fields changed
    syncTdmManifiesto(updated).catch(() => {});
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const addConfeccionistaToRoute = async (req: Request, res: Response): Promise<void> => {
  const {
    vehicle_id, conductor_id, client_id, fecha, confeccionista_id,
    enc_id, tipo, usuario_creacion, user_nombre,
  } = req.body;
  if (!confeccionista_id) {
    res.status(400).json({ error: 'confeccionista_id es obligatorio' }); return;
  }
  if (!enc_id && !vehicle_id) {
    res.status(400).json({ error: 'enc_id o vehicle_id son necesarios' }); return;
  }
  try {
    await ensureDonamaTables();
    const fechaVal = fecha || new Date().toLocaleDateString('en-CA');
    let encId = enc_id ? Number(enc_id) : null;

    // Si no hay enc_id, buscar enc existente o crear uno nuevo
    if (!encId) {
      const existing = await pool.query(
        `SELECT id FROM dogama_enc_planillas_historial
         WHERE vehicle_id=$1 AND fecha=$2
           AND COALESCE(conductor_id,'')=COALESCE($3,'')
           AND COALESCE(client_id,'')=COALESCE($4,'')
         LIMIT 1`,
        [vehicle_id, fechaVal, conductor_id || null, client_id || null]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        encId = existing.rows[0].id;
      } else {
        const newEnc = await pool.query(
          `INSERT INTO dogama_enc_planillas_historial
             (fecha, vehicle_id, conductor_id, client_id, estado_id, usuario_creacion)
           VALUES ($1,$2,$3,$4,'EST-01',$5) RETURNING id`,
          [fechaVal, vehicle_id, conductor_id || null, client_id || null, usuario_creacion || null]
        );
        encId = newEnc.rows[0].id;
      }
    }

    const r = await pool.query(
      `INSERT INTO dogama_planillas_historial
         (enc_id, tipo, confeccionista_id_directo, estado_id, usuario_creacion)
       VALUES ($1,$2,$3,'EST-01',$4)
       RETURNING *`,
      [encId, tipo || 'despacho', confeccionista_id, usuario_creacion || null]
    );
    const inserted = r.rows[0];
    await logAudit({
      enc_id: encId,
      planilla_id: inserted.id, action_type: 'add_confeccionista',
      user_id: usuario_creacion || null, user_nombre: user_nombre || null,
      new_value: { confeccionista_id, enc_id: encId },
    });
    res.status(201).json(inserted);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createPlanillaMaterialEmpaque = async (req: Request, res: Response): Promise<void> => {
  const {
    vehicle_id, fecha, confeccionista_id, remesa, manifiesto,
    valor_cxc, valor_cxp, intermediacion,
    cajas, tulas, canastas, costales, usuario_creacion,
  } = req.body;
  if (!vehicle_id) { res.status(400).json({ error: 'vehicle_id es obligatorio' }); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDonamaTables();

    const ar = await client.query(
      `SELECT a.driver_id, a.client_id FROM assignments a WHERE a.vehicle_id=$1 AND a.is_active=true LIMIT 1`,
      [vehicle_id]
    );
    const conductor_id = ar.rows[0]?.driver_id || null;
    const client_id   = ar.rows[0]?.client_id  || null;
    const fechaVal    = fecha || new Date().toLocaleDateString('en-CA');

    // 1. Crear encabezado de ruta
    const encR = await client.query(
      `INSERT INTO dogama_enc_planillas_historial
         (fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
          valor_cxc, valor_cxp, intermediacion, estado_id, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'EST-01',$10)
       RETURNING *`,
      [
        fechaVal, vehicle_id, conductor_id, client_id,
        remesa || null, manifiesto || null,
        valor_cxc     != null ? Number(valor_cxc)     : null,
        valor_cxp     != null ? Number(valor_cxp)     : null,
        intermediacion != null ? Number(intermediacion) : null,
        usuario_creacion || null,
      ]
    );
    const enc = encR.rows[0];

    // 2. Insertar fila de material_empaque con bultos y confeccionista directo
    const detR = await client.query(
      `INSERT INTO dogama_planillas_historial
         (enc_id, tipo, confeccionista_id_directo,
          cajas, tulas, canastas, costales, estado_id, usuario_creacion)
       VALUES ($1,'material_empaque',$2,$3,$4,$5,$6,'EST-01',$7)
       RETURNING *`,
      [
        enc.id,
        confeccionista_id || null,
        cajas    != null ? Number(cajas)    : null,
        tulas    != null ? Number(tulas)    : null,
        canastas != null ? Number(canastas) : null,
        costales != null ? Number(costales) : null,
        usuario_creacion || null,
      ]
    );

    await client.query('COMMIT');

    syncTdmManifiesto(enc).catch(() => {});

    res.status(201).json({ enc, row: detR.rows[0] });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};

// ── FLETES E INTERMEDIACIÓN ───────────────────────────────────────────────────

const ensureFletesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_fletes_intermediacion (
      id                          SERIAL PRIMARY KEY,
      flete_minimo                NUMERIC(14,2),
      valor_intermediacion_minimo NUMERIC(14,2),
      flete_maximo                NUMERIC(14,2),
      intermediacion_final        NUMERIC(14,2),
      estado_id                   VARCHAR(10) NOT NULL DEFAULT 'EST-01',
      usuario_creacion            VARCHAR(50),
      fecha_creacion              TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      usuario_actualizacion       VARCHAR(50),
      fecha_actualizacion         TIMESTAMPTZ
    )
  `);
};

export const getFletes = async (req: Request, res: Response) => {
  try {
    await ensureFletesTable();
    const r = await pool.query(`
      SELECT fi.*, e.name AS estado_nombre,
             uc.name AS usuario_creacion_nombre,
             ua.name AS usuario_actualizacion_nombre
      FROM dogama_fletes_intermediacion fi
      LEFT JOIN estados e  ON e.id  = fi.estado_id
      LEFT JOIN users   uc ON uc.id = fi.usuario_creacion
      LEFT JOIN users   ua ON ua.id = fi.usuario_actualizacion
      ORDER BY fi.id DESC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const createFlete = async (req: Request, res: Response) => {
  await ensureFletesTable();
  const { flete_minimo, valor_intermediacion_minimo, flete_maximo, intermediacion_final, estado_id, usuario_creacion } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO dogama_fletes_intermediacion
         (flete_minimo, valor_intermediacion_minimo, flete_maximo, intermediacion_final, estado_id, usuario_creacion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        flete_minimo != null ? Number(flete_minimo) : null,
        valor_intermediacion_minimo != null ? Number(valor_intermediacion_minimo) : null,
        flete_maximo != null ? Number(flete_maximo) : null,
        intermediacion_final != null ? Number(intermediacion_final) : null,
        estado_id || 'EST-01',
        usuario_creacion || null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const updateFlete = async (req: Request, res: Response) => {
  await ensureFletesTable();
  const { id } = req.params;
  const { flete_minimo, valor_intermediacion_minimo, flete_maximo, intermediacion_final, estado_id, usuario_actualizacion } = req.body;
  try {
    const r = await pool.query(
      `UPDATE dogama_fletes_intermediacion
       SET flete_minimo=$1, valor_intermediacion_minimo=$2, flete_maximo=$3,
           intermediacion_final=$4, estado_id=$5,
           fecha_actualizacion=(NOW() AT TIME ZONE 'America/Bogota'),
           usuario_actualizacion=$6
       WHERE id=$7 RETURNING *`,
      [
        flete_minimo != null ? Number(flete_minimo) : null,
        valor_intermediacion_minimo != null ? Number(valor_intermediacion_minimo) : null,
        flete_maximo != null ? Number(flete_maximo) : null,
        intermediacion_final != null ? Number(intermediacion_final) : null,
        estado_id || 'EST-01',
        usuario_actualizacion || null,
        id,
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

const ensureDonamaTables = async () => {
  // ── 1. Tabla encabezado (una por ruta) ─────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_enc_planillas_historial (
      id               SERIAL PRIMARY KEY,
      fecha            DATE        NOT NULL DEFAULT CURRENT_DATE,
      vehicle_id       TEXT        NOT NULL,
      conductor_id     TEXT,
      client_id        TEXT,
      remesa           TEXT,
      manifiesto       TEXT,
      valor_cxc        NUMERIC(14,2),
      valor_cxp        NUMERIC(14,2),
      intermediacion   NUMERIC(14,2),
      estado_id        VARCHAR(20) NOT NULL DEFAULT 'EST-01',
      usuario_creacion TEXT,
      fecha_creacion   TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      CONSTRAINT fk_enc_vehicle    FOREIGN KEY (vehicle_id)       REFERENCES vehicles(id)  ON DELETE SET NULL,
      CONSTRAINT fk_enc_conductor  FOREIGN KEY (conductor_id)     REFERENCES drivers(id)   ON DELETE SET NULL,
      CONSTRAINT fk_enc_client     FOREIGN KEY (client_id)        REFERENCES clients(id)   ON DELETE SET NULL,
      CONSTRAINT fk_enc_usuario    FOREIGN KEY (usuario_creacion) REFERENCES users(id)     ON DELETE SET NULL,
      CONSTRAINT fk_enc_estado     FOREIGN KEY (estado_id)        REFERENCES estados(id)
    )
  `);

  // ── 2. Auditoría ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_planillas_audit_log (
      id           SERIAL PRIMARY KEY,
      enc_id       INTEGER,
      planilla_id  INTEGER,
      action_type  VARCHAR(50) NOT NULL,
      user_id      VARCHAR(50),
      user_nombre  VARCHAR(200),
      old_value    JSONB,
      new_value    JSONB,
      notes        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 3. Columnas nuevas en detalle ────────────────────────────────────────
  await pool.query(`
    ALTER TABLE dogama_planillas_historial
      ADD COLUMN IF NOT EXISTS confeccionista_id_directo INTEGER,
      ADD COLUMN IF NOT EXISTS cajas            INTEGER,
      ADD COLUMN IF NOT EXISTS tulas            INTEGER,
      ADD COLUMN IF NOT EXISTS canastas         INTEGER,
      ADD COLUMN IF NOT EXISTS costales         INTEGER,
      ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT,
      ADD COLUMN IF NOT EXISTS enc_id           INTEGER REFERENCES dogama_enc_planillas_historial(id),
      ADD COLUMN IF NOT EXISTS estado_id        VARCHAR(20) DEFAULT 'EST-01',
      ADD COLUMN IF NOT EXISTS tipo_cancelacion VARCHAR(20)
  `);

  // ── 3b. enc_id en audit_log (tabla preexistente sin esa columna) ─────────
  await pool.query(`
    ALTER TABLE dogama_planillas_audit_log
      ADD COLUMN IF NOT EXISTS enc_id INTEGER
  `);

  // ── 3c. accion_importacion en dogama_tipos_oc ─────────────────────────────
  await pool.query(`
    ALTER TABLE dogama_tipos_oc
      ADD COLUMN IF NOT EXISTS accion_importacion VARCHAR(20) DEFAULT 'valida'
  `);

  // ── 4. Migración de datos existentes (solo si hay filas sin enc_id) ──────
  const pending = await pool.query(
    `SELECT COUNT(*) AS n FROM dogama_planillas_historial WHERE enc_id IS NULL`
  );
  if (Number(pending.rows[0].n) > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Crear un enc por cada grupo único (vehicle_id + conductor_id + client_id + fecha)
      await client.query(`
        INSERT INTO dogama_enc_planillas_historial
          (fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
           valor_cxc, valor_cxp, estado_id, usuario_creacion, fecha_creacion)
        SELECT DISTINCT ON (vehicle_id, COALESCE(conductor_id,''), COALESCE(client_id,''), fecha)
               fecha, vehicle_id, conductor_id, client_id, remesa, manifiesto,
               valor_cxc, valor_cxp,
               CASE WHEN estado = 'cancelado' THEN 'EST-16' ELSE 'EST-01' END,
               usuario_creacion, fecha_creacion
        FROM dogama_planillas_historial
        WHERE enc_id IS NULL
        ORDER BY vehicle_id, COALESCE(conductor_id,''), COALESCE(client_id,''), fecha, fecha_creacion
      `);
      // Enlazar cada detalle con su enc
      await client.query(`
        UPDATE dogama_planillas_historial ph
        SET enc_id = enc.id,
            estado_id = CASE WHEN ph.estado = 'cancelado' THEN 'EST-16' ELSE 'EST-01' END
        FROM dogama_enc_planillas_historial enc
        WHERE ph.enc_id IS NULL
          AND enc.vehicle_id = ph.vehicle_id
          AND COALESCE(enc.conductor_id,'') = COALESCE(ph.conductor_id,'')
          AND COALESCE(enc.client_id,'') = COALESCE(ph.client_id,'')
          AND enc.fecha = ph.fecha
      `);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally {
      client.release();
    }
  }

  // ── 5. Eliminar columnas redundantes del detalle (idempotente) ────────────
  const colsToDrop = ['fecha','vehicle_id','conductor_id','client_id',
                      'remesa','manifiesto','valor_cxc','valor_cxp','estado'];
  for (const col of colsToDrop) {
    await pool.query(
      `ALTER TABLE dogama_planillas_historial DROP COLUMN IF EXISTS ${col} CASCADE`
    );
  }

  // ── 6. Corregir CHECK constraint de tipo ──────────────────────────────────
  await pool.query(`
    ALTER TABLE dogama_planillas_historial
      DROP CONSTRAINT IF EXISTS dogama_planillas_historial_tipo_check
  `);
  await pool.query(`
    ALTER TABLE dogama_planillas_historial
      ADD CONSTRAINT dogama_planillas_historial_tipo_check
      CHECK (tipo IN ('despacho','cita','material_empaque'))
  `);

  // ── 7. Tabla notificaciones correo confeccionistas ────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_notif_correos (
      id                    SERIAL PRIMARY KEY,
      enc_id                INTEGER REFERENCES dogama_enc_planillas_historial(id) ON DELETE CASCADE,
      confeccionista_id     INTEGER,
      confeccionista_nombre VARCHAR(255),
      confeccionista_email  VARCHAR(150),
      placa                 VARCHAR(20),
      fecha_cita            DATE,
      conductor_nombre      VARCHAR(255),
      ruta_descripcion      TEXT,
      from_email            VARCHAR(150),
      from_provider         VARCHAR(20),
      estado                VARCHAR(30) DEFAULT 'pendiente',
      sent_at               TIMESTAMP,
      created_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      created_by            TEXT
    )
  `);

  // ── 8. Columna placa en flota_tdm_manifiestos ─────────────────────────────
  await pool.query(`
    ALTER TABLE flota_tdm_manifiestos
      ADD COLUMN IF NOT EXISTS placa VARCHAR(20)
  `);

  // ── 9. Maestra auxiliares de mesa ─────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_auxiliares_mesa (
      id               SERIAL PRIMARY KEY,
      nombre           VARCHAR(200) NOT NULL,
      estado_id        VARCHAR(20)  NOT NULL DEFAULT 'EST-01',
      usuario_creacion TEXT,
      fecha_creacion   TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      CONSTRAINT fk_aux_mesa_estado   FOREIGN KEY (estado_id)        REFERENCES estados(id),
      CONSTRAINT fk_aux_mesa_usuario  FOREIGN KEY (usuario_creacion) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // ── 10. Auxiliares externos por planilla ───────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_auxiliares_externos (
      id                    SERIAL PRIMARY KEY,
      nombre                VARCHAR(200) NOT NULL,
      planilla_historial_id INTEGER REFERENCES dogama_planillas_historial(id) ON DELETE CASCADE,
      usuario_creacion      TEXT,
      fecha_creacion        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      CONSTRAINT fk_aux_ext_usuario FOREIGN KEY (usuario_creacion) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // ── 11. Columnas de cargue en dogama_planillas_historial ──────────────────
  await pool.query(`
    ALTER TABLE dogama_planillas_historial
      ADD COLUMN IF NOT EXISTS unidades_carge    INTEGER,
      ADD COLUMN IF NOT EXISTS llegada_vh        TIME,
      ADD COLUMN IF NOT EXISTS aux_mesa_id       INTEGER REFERENCES dogama_auxiliares_mesa(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cantidad_cargada  INTEGER,
      ADD COLUMN IF NOT EXISTS hora_inicio_carge TIME,
      ADD COLUMN IF NOT EXISTS hora_final_carge  TIME,
      ADD COLUMN IF NOT EXISTS observaciones     TEXT,
      ADD COLUMN IF NOT EXISTS usuario_cargue_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `);

  // ── 12. Plantilla global de correo a confeccionistas ──────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dogama_email_template (
      id          SERIAL PRIMARY KEY,
      subject     TEXT NOT NULL DEFAULT 'Notificación de cita de recogida — {{placa}}',
      body        TEXT NOT NULL DEFAULT 'Estimado(a) {{confeccionista}},\n\nLe informamos que el vehículo {{placa}} conducido por {{conductor}} (Cédula: {{cedula}} | Cel: {{celular}}) pasará a recoger su mercancía el día {{fecha}}.\n\nLote(s): {{lotes}}\nRemesa: {{remesa}}\n\nGracias por su confianza.\n\nMilla 7 S.A.S.',
      updated_by  TEXT,
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  // Insertar plantilla por defecto si la tabla está vacía
  await pool.query(`
    INSERT INTO dogama_email_template (id, subject, body)
    SELECT 1,
      'Notificación de cita de recogida — {{placa}}',
      E'Estimado(a) {{confeccionista}},\n\nLe informamos que el vehículo {{placa}} conducido por {{conductor}} (Cédula: {{cedula}} | Cel: {{celular}}) pasará a recoger su mercancía el día {{fecha}}.\n\nLote(s): {{lotes}}\nRemesa: {{remesa}}\n\nGracias por su confianza.\n\nMilla 7 S.A.S.'
    WHERE NOT EXISTS (SELECT 1 FROM dogama_email_template)
  `);
};

// Alias para compatibilidad con llamadas previas
const ensurePlanillasColumns = ensureDonamaTables;

const logAudit = async (data: {
  enc_id?: number | null;
  vehicle_id?: string | null;   // kept for backward compat
  conductor_id?: string | null;
  client_id?: string | null;
  fecha?: string | null;
  planilla_id?: number | null;
  action_type: string;
  user_id?: string | null;
  user_nombre?: string | null;
  old_value?: object | null;
  new_value?: object | null;
  notes?: string | null;
}) => {
  try {
    await pool.query(
      `INSERT INTO dogama_planillas_audit_log
         (enc_id, planilla_id, action_type, user_id, user_nombre, old_value, new_value, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        data.enc_id ?? null,
        data.planilla_id ?? null, data.action_type,
        data.user_id ?? null, data.user_nombre ?? null,
        data.old_value ? JSON.stringify(data.old_value) : null,
        data.new_value ? JSON.stringify(data.new_value) : null,
        data.notes ?? null,
      ]
    );
  } catch { /* audit failures are non-fatal */ }
};

const syncTdmManifiesto = async (enc: any, dbClient?: any): Promise<void> => {
  // Solo sincronizar cuando los datos están completos
  if (!enc.manifiesto || !enc.remesa) return;
  const db = dbClient ?? pool;
  try {
    // Placa viene del vehículo; client_id viene del enc (se tomó del cliente seleccionado en la asignación)
    const vr = await db.query(`SELECT plate FROM vehicles WHERE id=$1`, [enc.vehicle_id]);
    const placa    = vr.rows[0]?.plate ?? null;
    const clientId = enc.client_id     ?? null;

    // Ciudad destino del primer confeccionista de la planilla
    const cr = await db.query(`
      SELECT COALESCE(c1.ciudad, c2.ciudad) AS ciudad
      FROM dogama_planillas_historial ph
      LEFT JOIN dogama_despachos dd ON dd.id = ph.despacho_id AND ph.tipo='despacho'
      LEFT JOIN dogama_citas_recogidas dc ON dc.id = ph.cita_id AND ph.tipo='cita'
      LEFT JOIN dogama_confeccionistas c1 ON c1.id = COALESCE(ph.confeccionista_id_directo, dd.confeccionista_id)
      LEFT JOIN dogama_confeccionistas c2 ON c2.id = dc.proveedor_id
      WHERE ph.enc_id = $1 AND COALESCE(c1.ciudad, c2.ciudad) IS NOT NULL
      LIMIT 1
    `, [enc.id]);
    const ciudadDestino = cr.rows[0]?.ciudad ?? null;

    await db.query(`
      INSERT INTO flota_tdm_manifiestos
        (manifiesto, fecha_operacion, remesa, valor_cobrar, valor_pagar,
         ciudad_origen, ciudad_destino, client_id, placa, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,'MEDELLIN',$6,$7,$8,$9)
      ON CONFLICT (manifiesto) DO UPDATE SET
        remesa         = EXCLUDED.remesa,
        valor_cobrar   = COALESCE(EXCLUDED.valor_cobrar, flota_tdm_manifiestos.valor_cobrar),
        valor_pagar    = COALESCE(EXCLUDED.valor_pagar,  flota_tdm_manifiestos.valor_pagar),
        ciudad_destino = COALESCE(EXCLUDED.ciudad_destino, flota_tdm_manifiestos.ciudad_destino),
        client_id      = COALESCE(EXCLUDED.client_id, flota_tdm_manifiestos.client_id),
        placa          = COALESCE(EXCLUDED.placa, flota_tdm_manifiestos.placa),
        uploaded_at    = NOW()
    `, [
      enc.manifiesto,
      enc.fecha,
      enc.remesa,
      enc.valor_cxc != null ? Number(enc.valor_cxc) : null,
      enc.valor_cxp != null ? Number(enc.valor_cxp) : null,
      ciudadDestino,
      clientId,
      placa,
      enc.usuario_creacion || null,
    ]);
  } catch { /* TDM sync is non-fatal */ }
};

export const getPlanillasHistorial = async (req: Request, res: Response) => {
  const { placa, fecha, confeccionista } = req.query as Record<string, string>;
  const params: any[] = [];
  const where: string[] = [];

  const fechaFiltro = fecha || new Date().toLocaleDateString('en-CA');
  params.push(fechaFiltro);
  where.push(`enc.fecha = $${params.length}`);

  if (placa) {
    params.push(`%${placa}%`);
    where.push(`v.plate ILIKE $${params.length}`);
  }
  if (confeccionista) {
    params.push(`%${confeccionista}%`);
    where.push(`(conf_dir.descripcion_conf ILIKE $${params.length} OR conf.descripcion_conf ILIKE $${params.length})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    await ensureDonamaTables();
    const r = await pool.query(`
      SELECT
        ph.id,
        ph.enc_id,
        ph.tipo,
        ph.despacho_id,
        ph.cita_id,
        ph.confeccionista_id_directo,
        ph.cajas, ph.tulas, ph.canastas, ph.costales,
        ph.estado_id,
        ph.motivo_cancelacion,
        ph.tipo_cancelacion,
        ph.usuario_creacion,
        ph.fecha_creacion,
        -- Campos del encabezado (nivel ruta)
        enc.fecha,
        enc.vehicle_id,
        enc.conductor_id,
        enc.client_id,
        enc.remesa,
        enc.manifiesto,
        enc.valor_cxc,
        enc.valor_cxp,
        enc.intermediacion,
        enc.estado_id        AS enc_estado_id,
        enc.usuario_creacion AS enc_usuario_creacion,
        -- Joins descriptivos
        v.plate              AS placa,
        v.brand              AS vehicle_brand,
        cl.name              AS client_nombre,
        d.name               AS conductor_nombre,
        u.name               AS usuario_nombre,
        COALESCE(conf_dir.descripcion_conf, conf.descripcion_conf) AS confeccionista_nombre,
        COALESCE(conf_dir.direccion,        conf.direccion)        AS confeccionista_direccion,
        COALESCE(conf_dir.ciudad,           conf.ciudad)           AS confeccionista_ciudad,
        dc.hora_inicio,
        dc.hora_fin,
        dc.turno,
        COALESCE(dd.referencia, dc.referencia) AS referencia,
        -- Campos adicionales de despachos / citas
        marc.descripcion AS marca,
        COALESCE(dd.lote,      dc.lote)          AS lote,
        COALESCE(dd.unidades,  dc.cantidad)      AS unidades,
        dd.orden_cargue,
        dd.orden_servicio,
        dc.color,
        dc.mesa,
        dc.numero_documento,
        toc.descripcion  AS tipo_oc,
        tp.descripcion   AS tipo_prenda
      FROM dogama_planillas_historial ph
      JOIN  dogama_enc_planillas_historial enc ON enc.id = ph.enc_id
      LEFT JOIN vehicles               v        ON v.id    = enc.vehicle_id
      LEFT JOIN clients                cl       ON cl.id   = enc.client_id
      LEFT JOIN drivers                d        ON d.id    = enc.conductor_id
      LEFT JOIN users                  u        ON u.id    = ph.usuario_creacion
      LEFT JOIN dogama_despachos       dd       ON dd.id   = ph.despacho_id  AND ph.tipo = 'despacho'
      LEFT JOIN dogama_citas_recogidas dc       ON dc.id   = ph.cita_id      AND ph.tipo = 'cita'
      LEFT JOIN dogama_confeccionistas conf     ON conf.id = COALESCE(dd.confeccionista_id, dc.proveedor_id)
      LEFT JOIN dogama_confeccionistas conf_dir ON conf_dir.id = ph.confeccionista_id_directo
      LEFT JOIN dogama_marcas          marc     ON marc.id = COALESCE(dd.marca_id, dc.marca_id)
      LEFT JOIN dogama_tipos_prenda    tp       ON tp.id   = dd.tipo_prenda_id
      LEFT JOIN dogama_tipos_oc        toc      ON toc.id  = dc.tipo_oc_id
      ${whereClause}
      ORDER BY
        COALESCE(dc.hora_fin, dc.hora_inicio, '99:99') ASC,
        dd.orden_cargue ASC,
        ph.fecha_creacion ASC
      LIMIT 500
    `, params);
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const changeRouteVehicle = async (req: Request, res: Response): Promise<void> => {
  const {
    old_vehicle_id, conductor_id, client_id, fecha,
    new_vehicle_id, user_id, user_nombre,
  } = req.body;
  if (!old_vehicle_id || !new_vehicle_id) {
    res.status(400).json({ error: 'old_vehicle_id y new_vehicle_id son obligatorios' }); return;
  }
  try {
    await ensureDonamaTables();
    const vr = await pool.query(`SELECT plate, brand FROM vehicles WHERE id=$1`, [new_vehicle_id]);
    if (vr.rowCount === 0) { res.status(404).json({ error: 'Vehículo no encontrado' }); return; }
    const { plate: new_plate, brand: new_brand } = vr.rows[0];
    const ovr = await pool.query(`SELECT plate FROM vehicles WHERE id=$1`, [old_vehicle_id]);
    const old_plate = ovr.rows[0]?.plate ?? old_vehicle_id;

    // Actualizar enc (el vehicle_id está en el encabezado)
    const encParams: any[] = [new_vehicle_id, old_vehicle_id];
    const encConds: string[] = ['vehicle_id=$2'];
    let pi = 3;
    if (conductor_id) { encParams.push(conductor_id); encConds.push(`conductor_id=$${pi++}`); }
    if (client_id)    { encParams.push(client_id);    encConds.push(`client_id=$${pi++}`);    }
    if (fecha)        { encParams.push(fecha);         encConds.push(`fecha=$${pi++}`);        }

    const r = await pool.query(
      `UPDATE dogama_enc_planillas_historial SET vehicle_id=$1 WHERE ${encConds.join(' AND ')} RETURNING id`,
      encParams
    );
    const enc_ids: number[] = r.rows.map((row: any) => row.id);

    await logAudit({
      enc_id: enc_ids[0] ?? null,
      action_type: 'change_vehicle',
      user_id: user_id || null, user_nombre: user_nombre || null,
      old_value: { vehicle_id: old_vehicle_id, placa: old_plate },
      new_value: { vehicle_id: new_vehicle_id, placa: new_plate, brand: new_brand },
      notes: `Cambiado de ${old_plate} a ${new_plate}. ${r.rowCount} enc(s) actualizados.`,
    });

    res.json({ updated: r.rowCount, new_vehicle_id, new_plate, new_brand });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getRouteAuditLog = async (req: Request, res: Response): Promise<void> => {
  const { enc_id } = req.query as Record<string, string>;
  const params: any[] = [];
  const conds: string[] = [];

  if (enc_id) { params.push(Number(enc_id)); conds.push(`enc_id=$${params.length}`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    await ensureDonamaTables();
    const r = await pool.query(
      `SELECT * FROM dogama_planillas_audit_log ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── NOTIFICACIONES CORREO CONFECCIONISTAS ─────────────────────────────────────

export const getNotifCorreos = async (req: Request, res: Response): Promise<void> => {
  const { estado, fecha_desde, fecha_hasta, enc_id } = req.query as Record<string, string>;
  const params: any[] = [];
  const conds: string[] = [];

  if (estado && estado !== 'todos') { params.push(estado); conds.push(`nc.estado=$${params.length}`); }
  if (fecha_desde) { params.push(fecha_desde); conds.push(`nc.fecha_cita >= $${params.length}`); }
  if (fecha_hasta)  { params.push(fecha_hasta);  conds.push(`nc.fecha_cita <= $${params.length}`); }
  if (enc_id)       { params.push(Number(enc_id)); conds.push(`nc.enc_id=$${params.length}`); }

  const whereStr = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    await ensureDonamaTables();
    const r = await pool.query(`
      SELECT nc.*,
             dc.descripcion_conf  AS conf_nombre_actual,
             dc.correo            AS conf_email_actual,
             dc.ciudad            AS conf_ciudad,
             enc.remesa, enc.manifiesto, enc.fecha AS enc_fecha,
             v.plate              AS placa_actual,
             d.document_number    AS cedula_conductor,
             d.phone              AS celular_conductor,
             (
               SELECT string_agg(DISTINCT COALESCE(dd.lote, cr.lote), ', ' ORDER BY COALESCE(dd.lote, cr.lote))
               FROM dogama_planillas_historial ph
               LEFT JOIN dogama_despachos dd       ON dd.id = ph.despacho_id AND ph.tipo = 'despacho'
               LEFT JOIN dogama_citas_recogidas cr  ON cr.id = ph.cita_id    AND ph.tipo = 'cita'
               WHERE ph.enc_id = nc.enc_id
                 AND COALESCE(ph.confeccionista_id_directo, dd.confeccionista_id, cr.proveedor_id) = nc.confeccionista_id
                 AND COALESCE(dd.lote, cr.lote) IS NOT NULL
             ) AS lotes
      FROM dogama_notif_correos nc
      LEFT JOIN dogama_enc_planillas_historial enc ON enc.id = nc.enc_id
      LEFT JOIN dogama_confeccionistas dc ON dc.id = nc.confeccionista_id
      LEFT JOIN vehicles v  ON v.id  = enc.vehicle_id
      LEFT JOIN drivers  d  ON d.id  = enc.conductor_id
      ${whereStr}
      ORDER BY nc.created_at DESC
      LIMIT 500
    `, params);
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createNotifCorreos = async (req: Request, res: Response): Promise<void> => {
  const { enc_id, created_by } = req.body;
  if (!enc_id) { res.status(400).json({ error: 'enc_id es obligatorio' }); return; }
  try {
    await ensureDonamaTables();

    // Obtener datos del enc y sus confeccionistas únicos
    const encR = await pool.query(
      `SELECT enc.*, v.plate FROM dogama_enc_planillas_historial enc
       LEFT JOIN vehicles v ON v.id = enc.vehicle_id WHERE enc.id=$1`, [enc_id]
    );
    if (encR.rowCount === 0) { res.status(404).json({ error: 'Enc no encontrado' }); return; }
    const enc = encR.rows[0];

    const conductorR = await pool.query(
      `SELECT name FROM drivers WHERE id=$1`, [enc.conductor_id]
    );
    const conductorNombre = conductorR.rows[0]?.name ?? null;

    // Confeccionistas únicos de la planilla
    const confR = await pool.query(`
      SELECT DISTINCT ON (dc.id) dc.id, dc.descripcion_conf, dc.correo, dc.ciudad
      FROM dogama_planillas_historial ph
      LEFT JOIN dogama_despachos dd ON dd.id = ph.despacho_id AND ph.tipo='despacho'
      LEFT JOIN dogama_citas_recogidas cr ON cr.id = ph.cita_id AND ph.tipo='cita'
      LEFT JOIN dogama_confeccionistas dc ON dc.id = COALESCE(ph.confeccionista_id_directo, dd.confeccionista_id, cr.proveedor_id)
      WHERE ph.enc_id = $1 AND dc.id IS NOT NULL
    `, [enc_id]);

    const emailCfgR = await pool.query(
      `SELECT email, provider FROM dogama_email_config WHERE is_active=true ORDER BY created_at DESC LIMIT 1`
    );
    const fromEmail    = emailCfgR.rows[0]?.email    ?? null;
    const fromProvider = emailCfgR.rows[0]?.provider ?? null;

    const inserted: any[] = [];
    for (const conf of confR.rows) {
      const r = await pool.query(`
        INSERT INTO dogama_notif_correos
          (enc_id, confeccionista_id, confeccionista_nombre, confeccionista_email,
           placa, fecha_cita, conductor_nombre, ruta_descripcion,
           from_email, from_provider, estado, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendiente',$11)
        RETURNING *
      `, [
        enc_id, conf.id, conf.descripcion_conf, conf.correo ?? null,
        enc.plate ?? null, enc.fecha, conductorNombre,
        conf.ciudad ? `${enc.plate ?? ''} → ${conf.ciudad}` : (enc.plate ?? null),
        fromEmail, fromProvider, created_by ?? null,
      ]);
      inserted.push(r.rows[0]);
    }

    res.status(201).json({ created: inserted.length, rows: inserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const updateNotifCorreo = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { estado } = req.body;
  const VALID = ['pendiente', 'enviado', 'cancelado'];
  if (!VALID.includes(estado)) { res.status(400).json({ error: 'Estado inválido' }); return; }
  try {
    const r = await pool.query(
      `UPDATE dogama_notif_correos SET estado=$1,
         sent_at = CASE WHEN $1='enviado' THEN NOW() ELSE sent_at END
       WHERE id=$2 RETURNING *`,
      [estado, id]
    );
    if (r.rowCount === 0) { res.status(404).json({ error: 'No encontrado' }); return; }
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── Plantilla global de correo ────────────────────────────────────────────────

export const getEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDonamaTables();
    const r = await pool.query(`SELECT * FROM dogama_email_template ORDER BY id LIMIT 1`);
    res.json(r.rows[0] ?? null);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const saveEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  const { subject, body, updated_by } = req.body;
  if (!subject || !body) { res.status(400).json({ error: 'subject y body son obligatorios' }); return; }
  try {
    await ensureDonamaTables();
    const r = await pool.query(`
      INSERT INTO dogama_email_template (id, subject, body, updated_by, updated_at)
      VALUES (1, $1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET subject=$1, body=$2, updated_by=$3, updated_at=NOW()
      RETURNING *
    `, [subject, body, updated_by ?? null]);
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

const applyTemplate = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
};

const wrapEmailHtml = (bodyText: string): string => {
  const htmlBody = bodyText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr>
    <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 40px;text-align:center;">
      <p style="margin:0;color:#c7d2fe;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">MILLA SIE7E GRUPO LOGÍSTICO</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:900;">Notificación de Recogida</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px;color:#334155;font-size:14px;line-height:1.8;">
      ${htmlBody}
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">MILLA SIE7E S.A.S. · OrbitM7 Sistema de Gestión Logística</p>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">WhatsApp: 3011825161 · directorti@millasiete.com</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
};

const buildConfeccionistaEmailHtml = (data: {
  confeccionistaNombre: string;
  placa: string;
  conductorNombre: string;
  fecha: string;
  remesa?: string | null;
  manifiesto?: string | null;
  ciudadDestino?: string | null;
}): string => {
  const dateStr = data.fecha
    ? new Date(data.fecha + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Confirmación de Recogida</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
      <p style="margin:0;color:#c7d2fe;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">MILLA SIE7E GRUPO LOGÍSTICO</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:900;">Confirmación de Recogida</h1>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 40px;">
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Estimado(a),</p>
      <p style="margin:0 0 24px;color:#1e293b;font-size:18px;font-weight:700;">${data.confeccionistaNombre}</p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Le confirmamos que el vehículo asignado para la recogida de mercancía está programado con los siguientes datos:
      </p>

      <!-- Info box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="6">
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;width:40%;padding:6px 0;">Placa del vehículo</td>
              <td style="color:#1e293b;font-size:15px;font-weight:900;font-family:monospace;letter-spacing:2px;">${data.placa}</td>
            </tr>
            <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;padding:6px 0;">Conductor</td>
              <td style="color:#1e293b;font-size:14px;font-weight:700;">${data.conductorNombre || '—'}</td>
            </tr>
            <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;padding:6px 0;">Fecha programada</td>
              <td style="color:#4f46e5;font-size:14px;font-weight:700;">${dateStr}</td>
            </tr>
            ${data.remesa ? `<tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;padding:6px 0;">Remesa</td>
              <td style="color:#1e293b;font-size:14px;font-weight:700;font-family:monospace;">${data.remesa}</td>
            </tr>` : ''}
            ${data.manifiesto ? `<tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;padding:6px 0;">Manifiesto</td>
              <td style="color:#1e293b;font-size:14px;font-weight:700;font-family:monospace;">${data.manifiesto}</td>
            </tr>` : ''}
            ${data.ciudadDestino ? `<tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;padding:6px 0;">Destino</td>
              <td style="color:#059669;font-size:14px;font-weight:700;">${data.ciudadDestino}</td>
            </tr>` : ''}
          </table>
        </td></tr>
      </table>

      <p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:1.6;">
        Por favor tenga su mercancía lista para la hora acordada. Ante cualquier inquietud comuníquese con nosotros.
      </p>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">MILLA SIE7E S.A.S. · OrbitM7 Sistema de Gestión Logística</p>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">WhatsApp: 3011825161 · directorti@millasiete.com</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
};

export const sendSingleNotifCorreo = async (id: number): Promise<{ success: boolean; to?: string; error?: string }> => {
  const nr = await pool.query(
    `SELECT nc.*, enc.remesa, enc.manifiesto, enc.fecha AS enc_fecha,
            dc.ciudad AS conf_ciudad, dc.correo AS conf_email_actual, v.plate AS placa_actual,
            d.name AS conductor_name_actual, d.document_number AS cedula, d.phone AS celular,
            (SELECT string_agg(DISTINCT COALESCE(dd.lote, cr.lote), ', ' ORDER BY COALESCE(dd.lote, cr.lote))
             FROM dogama_planillas_historial ph
             LEFT JOIN dogama_despachos dd       ON dd.id = ph.despacho_id AND ph.tipo='despacho'
             LEFT JOIN dogama_citas_recogidas cr  ON cr.id = ph.cita_id    AND ph.tipo='cita'
             WHERE ph.enc_id = nc.enc_id
               AND COALESCE(ph.confeccionista_id_directo, dd.confeccionista_id, cr.proveedor_id) = nc.confeccionista_id
               AND COALESCE(dd.lote, cr.lote) IS NOT NULL
            ) AS lotes
     FROM dogama_notif_correos nc
     LEFT JOIN dogama_enc_planillas_historial enc ON enc.id = nc.enc_id
     LEFT JOIN dogama_confeccionistas dc ON dc.id = nc.confeccionista_id
     LEFT JOIN vehicles v ON v.id = enc.vehicle_id
     LEFT JOIN drivers d ON d.id = enc.conductor_id
     WHERE nc.id=$1`, [id]
  );
  if (nr.rowCount === 0) {
    return { success: false, error: 'Notificación no encontrada' };
  }
  const notif = nr.rows[0];

  const toEmail = notif.confeccionista_email || notif.conf_email_actual;
  if (!toEmail) {
    return { success: false, error: 'El confeccionista no tiene correo registrado' };
  }

  const provider = notif.from_provider ?? 'gmail';
  const cfgR = await pool.query(
    `SELECT * FROM dogama_email_config WHERE provider=$1 AND is_active=true`, [provider]
  );

  // Intentar usar plantilla guardada; si no existe, usar HTML clásico
  const tmplR = await pool.query(`SELECT subject, body FROM dogama_email_template WHERE id=1`);
  const placa  = notif.placa_actual ?? notif.placa ?? '—';
  const fechaStr = notif.fecha_cita ?? notif.enc_fecha
    ? new Date((notif.fecha_cita ?? notif.enc_fecha) + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const vars: Record<string, string> = {
    confeccionista: notif.confeccionista_nombre ?? '—',
    ciudad:         notif.conf_ciudad ?? '—',
    placa,
    conductor:      notif.conductor_name_actual ?? notif.conductor_nombre ?? '—',
    cedula:         notif.cedula ?? '—',
    celular:        notif.celular ?? '—',
    fecha:          fechaStr,
    lotes:          notif.lotes ?? '—',
    remesa:         notif.remesa ?? '—',
    manifiesto:     notif.manifiesto ?? '—',
  };

  let htmlBody: string;
  let subject: string;
  if (tmplR.rowCount && tmplR.rows[0].body) {
    subject  = applyTemplate(tmplR.rows[0].subject, vars);
    htmlBody = wrapEmailHtml(applyTemplate(tmplR.rows[0].body, vars));
  } else {
    htmlBody = buildConfeccionistaEmailHtml({
      confeccionistaNombre: notif.confeccionista_nombre ?? '—',
      placa, conductorNombre: vars.conductor,
      fecha: notif.fecha_cita ?? notif.enc_fecha,
      remesa: notif.remesa, manifiesto: notif.manifiesto, ciudadDestino: notif.conf_ciudad,
    });
    subject = `Confirmación de Recogida · ${notif.confeccionista_nombre ?? ''}`;
  }

  if (cfgR.rowCount > 0) {
    const cfg = cfgR.rows[0];
    if (provider === 'gmail') {
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: cfg.email,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: cfg.refresh_token,
          accessToken: cfg.access_token,
        } as any,
      });
      await transport.sendMail({
        from: `"Milla 7 Logística" <${cfg.email}>`,
        to: toEmail,
        subject,
        html: htmlBody,
      });
    } else {
      const { data: tokenData } = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: cfg.refresh_token,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', {
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: [{ emailAddress: { address: toEmail } }],
        },
      }, { headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' } });
    }
  } else {
    // Fallback a Resend / SMTP configurado globalmente
    await sendEmail(toEmail, subject, htmlBody);
  }

  await pool.query(
    `UPDATE dogama_notif_correos SET estado='enviado', sent_at=NOW() WHERE id=$1`, [id]
  );
  return { success: true, to: toEmail };
};

export const sendNotifCorreo = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const result = await sendSingleNotifCorreo(Number(id));
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true, to: result.to });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const bulkSendNotifCorreos = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'Lista de IDs inválida' });
    return;
  }
  try {
    const results: any[] = [];
    for (const id of ids) {
      try {
        const result = await sendSingleNotifCorreo(Number(id));
        results.push({ id, ...result });
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Error desconocido' });
      }
    }
    res.json({ success: true, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── Maestra Auxiliares de Mesa ─────────────────────────────────────────────────

export const getAuxiliaresMesa = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  try {
    const r = await pool.query(`
      SELECT am.*, e.descripcion AS estado_nombre, u.name AS usuario_nombre
      FROM dogama_auxiliares_mesa am
      LEFT JOIN estados e ON e.id = am.estado_id
      LEFT JOIN users u ON u.id::text = am.usuario_creacion::text
      ORDER BY am.nombre
    `);
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createAuxiliarMesa = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  const { nombre, estado_id, usuario_creacion } = req.body;
  if (!nombre?.trim()) { res.status(400).json({ error: 'nombre es obligatorio' }); return; }
  try {
    const r = await pool.query(
      `INSERT INTO dogama_auxiliares_mesa (nombre, estado_id, usuario_creacion)
       VALUES ($1, COALESCE($2,'EST-01'), $3) RETURNING *`,
      [nombre.trim(), estado_id || null, usuario_creacion || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const updateAuxiliarMesa = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  const { id } = req.params;
  const { nombre, estado_id } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  if (nombre !== undefined) { vals.push(nombre); sets.push(`nombre=$${vals.length}`); }
  if (estado_id !== undefined) { vals.push(estado_id); sets.push(`estado_id=$${vals.length}`); }
  if (sets.length === 0) { res.status(400).json({ error: 'Sin campos válidos' }); return; }
  vals.push(id);
  try {
    const r = await pool.query(
      `UPDATE dogama_auxiliares_mesa SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    if (r.rowCount === 0) { res.status(404).json({ error: 'No encontrado' }); return; }
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const deleteAuxiliarMesa = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  try {
    await pool.query(`DELETE FROM dogama_auxiliares_mesa WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── Patch cargue de planilla (usuario diferente al creador) ───────────────────

export const patchPlanillaCargue = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  const { id } = req.params;
  const {
    unidades_carge, llegada_vh, aux_mesa_id,
    cantidad_cargada, hora_inicio_carge, hora_final_carge,
    observaciones, usuario_cargue_id,
  } = req.body;

  try {
    const r = await pool.query(
      `UPDATE dogama_planillas_historial
       SET unidades_carge=$1, llegada_vh=$2, aux_mesa_id=$3,
           cantidad_cargada=$4, hora_inicio_carge=$5, hora_final_carge=$6,
           observaciones=$7, usuario_cargue_id=$8
       WHERE id=$9 RETURNING *`,
      [
        unidades_carge ?? null,
        llegada_vh     || null,
        aux_mesa_id    ?? null,
        cantidad_cargada ?? null,
        hora_inicio_carge || null,
        hora_final_carge  || null,
        observaciones  || null,
        usuario_cargue_id ?? null,
        id,
      ]
    );
    if (r.rowCount === 0) { res.status(404).json({ error: 'Planilla no encontrada' }); return; }
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── Auxiliares Externos por planilla ──────────────────────────────────────────

export const getAuxiliaresExternos = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  const { planilla_id } = req.query;
  try {
    const r = await pool.query(
      `SELECT ae.*, u.name AS usuario_nombre
       FROM dogama_auxiliares_externos ae
       LEFT JOIN users u ON u.id::text = ae.usuario_creacion::text
       WHERE ($1::integer IS NULL OR ae.planilla_historial_id = $1::integer)
       ORDER BY ae.fecha_creacion`,
      [planilla_id || null]
    );
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createAuxiliarExterno = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  const { nombre, planilla_historial_id, usuario_creacion } = req.body;
  if (!nombre?.trim()) { res.status(400).json({ error: 'nombre es obligatorio' }); return; }
  try {
    const r = await pool.query(
      `INSERT INTO dogama_auxiliares_externos (nombre, planilla_historial_id, usuario_creacion)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre.trim(), planilla_historial_id || null, usuario_creacion || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const deleteAuxiliarExterno = async (req: Request, res: Response): Promise<void> => {
  await ensureDonamaTables();
  try {
    await pool.query(`DELETE FROM dogama_auxiliares_externos WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
