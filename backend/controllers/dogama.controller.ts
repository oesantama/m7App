import { Request, Response } from 'express';
import pool from '../config/database.js';
import nodemailer from 'nodemailer';
import axios from 'axios';

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
  const { descripcion, estado_id, usuariocreacion } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'descripcion es obligatorio' });
  const estadoId = estado_id || 'EST-01';
  try {
    const r = await pool.query(
      `INSERT INTO ${table} (descripcion, estado_id, usuariocreacion) VALUES ($1,$2,$3) RETURNING *`,
      [descripcion.trim(), estadoId, usuariocreacion || null]
    );
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
  const { descripcion, estado_id, usuarioactualizacion } = req.body;
  try {
    const r = await pool.query(
      `UPDATE ${table} SET descripcion=$1, estado_id=$2,
           fecha_actualizacion=(NOW() AT TIME ZONE 'America/Bogota'), usuarioactualizacion=$3
       WHERE id=$4 RETURNING *`,
      [descripcion, estado_id || 'EST-01', usuarioactualizacion || null, id]
    );
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
    COALESCE(dm.descripcion, d.marca_txt) AS marca_nombre,
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
            marca_id, marca_txt, referencia, lote, unidades,
            tipo_prenda_id, estado_id, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EST-03',$11)
         ON CONFLICT ON CONSTRAINT uq_despacho DO NOTHING
         RETURNING id`,
        [
          row.fecha || null,
          row.orden_cargue || null,
          row.confeccionista_id || null,
          row.orden_servicio || null,
          row.marca_id || null,
          row.marca_txt || null,
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
  const { vehicle_id, remesa, manifiesto, valor_cxc, valor_cxp, items, usuario_creacion } = req.body;
  if (!vehicle_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'vehicle_id e items son obligatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Derive conductor_id and client_id from active fleet assignment
    const ar = await client.query(
      `SELECT a.driver_id, a.client_id
       FROM assignments a
       WHERE a.vehicle_id = $1 AND a.is_active = true
       LIMIT 1`,
      [vehicle_id]
    );
    const conductor_id = ar.rows[0]?.driver_id || null;
    const client_id   = ar.rows[0]?.client_id  || null;

    const inserted: any[] = [];
    const despIds: number[] = [];
    const citaIds: number[] = [];

    for (const item of items as Array<{ tipo: 'despacho' | 'cita'; id: number }>) {
      const r = await client.query(
        `INSERT INTO dogama_planillas_historial
           (vehicle_id, conductor_id, client_id, remesa, manifiesto, valor_cxc, valor_cxp,
            tipo, despacho_id, cita_id, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          vehicle_id,
          conductor_id || null,
          client_id,
          remesa     || null,
          manifiesto || null,
          valor_cxc  != null ? Number(valor_cxc)  : null,
          valor_cxp  != null ? Number(valor_cxp)  : null,
          item.tipo,
          item.tipo === 'despacho' ? item.id : null,
          item.tipo === 'cita'     ? item.id : null,
          usuario_creacion || null,
        ]
      );
      inserted.push(r.rows[0]);
      if (item.tipo === 'despacho') despIds.push(item.id);
      else citaIds.push(item.id);
    }

    if (despIds.length > 0) {
      await client.query(
        `UPDATE dogama_despachos SET estado_id='EST-10' WHERE id = ANY($1::int[])`,
        [despIds]
      );
    }
    if (citaIds.length > 0) {
      await client.query(
        `UPDATE dogama_citas_recogidas SET estado_id='EST-10' WHERE id = ANY($1::int[])`,
        [citaIds]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ inserted: inserted.length, rows: inserted });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};

export const getPlanillasHistorial = async (req: Request, res: Response) => {
  const { placa, fecha, confeccionista } = req.query as Record<string, string>;
  const params: any[] = [];
  const where: string[] = [];

  // Default to today when no fecha provided
  const fechaFiltro = fecha || new Date().toLocaleDateString('en-CA');
  params.push(fechaFiltro);
  where.push(`ph.fecha = $${params.length}`);

  if (placa) {
    params.push(`%${placa}%`);
    where.push(`v.plate ILIKE $${params.length}`);
  }

  if (confeccionista) {
    params.push(`%${confeccionista}%`);
    where.push(`conf.descripcion_conf ILIKE $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const r = await pool.query(`
      SELECT ph.*,
             v.plate                      AS placa,
             v.brand                      AS vehicle_brand,
             cl.name                      AS client_nombre,
             d.name                       AS conductor_nombre,
             u.name                       AS usuario_nombre,
             conf.descripcion_conf        AS confeccionista_nombre
      FROM dogama_planillas_historial ph
      LEFT JOIN vehicles                v    ON v.id    = ph.vehicle_id
      LEFT JOIN clients                 cl   ON cl.id   = ph.client_id
      LEFT JOIN drivers                 d    ON d.id    = ph.conductor_id
      LEFT JOIN users                   u    ON u.id    = ph.usuario_creacion
      LEFT JOIN dogama_despachos        dd   ON dd.id   = ph.despacho_id  AND ph.tipo = 'despacho'
      LEFT JOIN dogama_citas_recogidas  dc   ON dc.id   = ph.cita_id      AND ph.tipo = 'cita'
      LEFT JOIN dogama_confeccionistas  conf ON conf.id = COALESCE(dd.confeccionista_id, dc.proveedor_id)
      ${whereClause}
      ORDER BY ph.fecha_creacion DESC
      LIMIT 500
    `, params);
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
