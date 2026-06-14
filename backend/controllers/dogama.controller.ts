import { Request, Response } from 'express';
import pool from '../config/database.js';
import nodemailer from 'nodemailer';
import axios from 'axios';

// ── CONFECCIONISTAS ───────────────────────────────────────────────────────────

export const getConfeccionistas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM dogama_confeccionistas ORDER BY descripcion_conf ASC'
    );
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createConfeccionista = async (req: Request, res: Response) => {
  const { descripcion_conf, direccion, ciudad, estado, usuariocreacion, telefono, correo } = req.body;
  if (!descripcion_conf) {
    return res.status(400).json({ error: 'descripcion_conf es obligatorio' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO dogama_confeccionistas
         (descripcion_conf, direccion, ciudad, estado, usuariocreacion, telefono, correo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [descripcion_conf.trim(), direccion.trim(), ciudad || null, estado || 'activo',
       usuariocreacion || null, telefono || null, correo || null]
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
    const dir = (row.direccion || row.Direccion || '').trim();
    if (!conf || !dir) { errors.push({ row, reason: 'Faltan campos requeridos' }); continue; }
    try {
      const r = await pool.query(
        `INSERT INTO dogama_confeccionistas
           (descripcion_conf, direccion, ciudad, estado, usuariocreacion, correo)
         VALUES ($1,$2,$3,'activo',$4,$5)
         ON CONFLICT (descripcion_conf, direccion) DO NOTHING
         RETURNING *`,
        [conf, dir, row.CIUDAD || row.ciudad || null, usuariocreacion || null, row.correo || row.Correo || null]
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
  const { descripcion_conf, direccion, ciudad, estado, telefono, correo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE dogama_confeccionistas
       SET descripcion_conf=$1, direccion=$2, ciudad=$3, estado=$4, telefono=$5, correo=$6
       WHERE id=$7 RETURNING *`,
      [descripcion_conf, direccion, ciudad || null, estado || 'activo', telefono || null, correo || null, id]
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

// ── CATÁLOGOS GENÉRICOS (Marcas + Tipos Prenda) ───────────────────────────────
type CatalogTable = 'dogama_marcas' | 'dogama_tipos_prenda' | 'dogama_proveedores' | 'dogama_tipos_oc';

const ALLOWED_TABLES: CatalogTable[] = ['dogama_marcas', 'dogama_tipos_prenda', 'dogama_proveedores', 'dogama_tipos_oc'];

const assertTable = (t: string): t is CatalogTable => ALLOWED_TABLES.includes(t as any);

export const getCatalog = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  try {
    const r = await pool.query(`SELECT * FROM ${table} ORDER BY descripcion ASC`);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const createCatalogItem = async (req: Request, res: Response) => {
  const table = req.params.table as string;
  if (!assertTable(table)) return res.status(400).json({ error: 'Tabla no válida' });
  const { descripcion, estado, usuariocreacion } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'descripcion es obligatorio' });
  try {
    const r = await pool.query(
      `INSERT INTO ${table} (descripcion, estado, usuariocreacion) VALUES ($1,$2,$3) RETURNING *`,
      [descripcion.trim(), estado || 'activo', usuariocreacion || null]
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
        `INSERT INTO ${table} (descripcion, estado, usuariocreacion) VALUES ($1,'activo',$2) ON CONFLICT (descripcion) DO NOTHING RETURNING id`,
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
  const { descripcion, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE ${table} SET descripcion=$1, estado=$2 WHERE id=$3 RETURNING *`,
      [descripcion, estado || 'activo', id]
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
    dm.descripcion       AS marca_nombre,
    dtp.descripcion      AS tipo_prenda_nombre
  FROM dogama_despachos d
  LEFT JOIN dogama_confeccionistas dc ON dc.id = d.confeccionista_id
  LEFT JOIN dogama_marcas          dm ON dm.id = d.marca_id
  LEFT JOIN dogama_tipos_prenda    dtp ON dtp.id = d.tipo_prenda_id
`;

export const getDespachos = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`${DESPACHOS_SELECT} ORDER BY d.fecha DESC, d.id DESC LIMIT 2000`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

async function resolveIds(pool: any, confTxt: string, marcaTxt: string, tipoPrendaTxt: string) {
  const [confRes, marcaRes, tipoRes] = await Promise.all([
    confTxt ? pool.query('SELECT id FROM dogama_confeccionistas WHERE LOWER(TRIM(descripcion_conf))=LOWER(TRIM($1)) LIMIT 1', [confTxt]) : Promise.resolve({ rows: [] }),
    marcaTxt ? pool.query('SELECT id FROM dogama_marcas WHERE LOWER(TRIM(descripcion))=LOWER(TRIM($1)) LIMIT 1', [marcaTxt]) : Promise.resolve({ rows: [] }),
    tipoPrendaTxt ? pool.query('SELECT id FROM dogama_tipos_prenda WHERE LOWER(TRIM(descripcion))=LOWER(TRIM($1)) LIMIT 1', [tipoPrendaTxt]) : Promise.resolve({ rows: [] }),
  ]);
  return {
    confId: confRes.rows[0]?.id || null,
    marcaId: marcaRes.rows[0]?.id || null,
    tipoId: tipoRes.rows[0]?.id || null,
  };
}

export const bulkCreateDespachos = async (req: Request, res: Response) => {
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de filas' });

  let inserted = 0; let duplicates = 0; let errors = 0;

  for (const row of rows) {
    const confTxt   = (row.confeccionista_txt || '').trim();
    const marcaTxt  = (row.marca_txt || '').trim();
    const tipoPTxt  = (row.tipo_prenda_txt || '').trim();

    try {
      const { confId, marcaId, tipoId } = await resolveIds(pool, confTxt, marcaTxt, tipoPTxt);

      const r = await pool.query(
        `INSERT INTO dogama_despachos
           (fecha, orden_cargue, confeccionista_id, confeccionista_txt, orden_servicio,
            marca_id, marca_txt, referencia, lote, unidades,
            tipo_prenda_id, tipo_prenda_txt, estado, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendiente',$13)
         ON CONFLICT ON CONSTRAINT uq_despacho DO NOTHING
         RETURNING id`,
        [
          row.fecha || null,
          row.orden_cargue || null,
          confId, confTxt,
          row.orden_servicio || null,
          marcaId, marcaTxt,
          row.referencia || null,
          row.lote || null,
          row.unidades ? Number(row.unidades) : null,
          tipoId, tipoPTxt,
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
  const { estado } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dogama_despachos SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]
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
    doc.descripcion      AS tipo_oc_nombre
  FROM dogama_citas_recogidas c
  LEFT JOIN dogama_marcas          dm  ON dm.id  = c.marca_id
  LEFT JOIN dogama_confeccionistas dc  ON dc.id  = c.proveedor_id
  LEFT JOIN dogama_tipos_oc        doc ON doc.id = c.tipo_oc_id
`;

export const getCitasRecogidas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`${CITAS_SELECT} ORDER BY c.fecha DESC, c.id DESC LIMIT 2000`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const bulkCreateCitas = async (req: Request, res: Response) => {
  const { rows, usuariocreacion } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de filas' });

  let inserted = 0; let duplicates = 0; let errors = 0;

  for (const row of rows) {
    const marcaTxt     = (row.marca_txt || '').trim();
    const proveedorTxt = (row.proveedor_txt || row.proveedor || '').trim();
    const tipoOcTxt    = (row.tipo_oc || '').trim();
    try {
      const [marcaRes, provRes, tipoOcRes] = await Promise.all([
        marcaTxt
          ? pool.query('SELECT id FROM dogama_marcas WHERE LOWER(TRIM(descripcion))=LOWER(TRIM($1)) LIMIT 1', [marcaTxt])
          : Promise.resolve({ rows: [] }),
        proveedorTxt
          ? pool.query('SELECT id FROM dogama_confeccionistas WHERE LOWER(TRIM(descripcion_conf))=LOWER(TRIM($1)) LIMIT 1', [proveedorTxt])
          : Promise.resolve({ rows: [] }),
        tipoOcTxt
          ? pool.query('SELECT id FROM dogama_tipos_oc WHERE LOWER(TRIM(descripcion))=LOWER(TRIM($1)) LIMIT 1', [tipoOcTxt])
          : Promise.resolve({ rows: [] }),
      ]);
      const marcaId     = marcaRes.rows[0]?.id || null;
      const proveedorId = provRes.rows[0]?.id || null;
      const tipoOcId    = tipoOcRes.rows[0]?.id || null;

      const r = await pool.query(
        `INSERT INTO dogama_citas_recogidas
           (fecha, turno, hora_inicio, hora_fin,
            marca_id, marca_txt, referencia, color, lote,
            mesa, cantidad, proveedor, proveedor_id, numero_documento,
            tipo_oc, tipo_oc_id, estado, usuario_creacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pendiente',$17)
         ON CONFLICT ON CONSTRAINT uq_cita DO NOTHING
         RETURNING id`,
        [
          row.fecha || null,
          row.turno || null,
          row.hora_inicio || null,
          row.hora_fin || null,
          marcaId, marcaTxt,
          row.referencia || null,
          row.color || null,
          row.lote || null,
          row.mesa != null ? Number(row.mesa) : null,
          row.cantidad != null ? Number(row.cantidad) : null,
          proveedorTxt || null,
          proveedorId,
          row.numero_documento || null,
          tipoOcTxt || null,
          tipoOcId,
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
  const { estado } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dogama_citas_recogidas SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const patchCita = async (req: Request, res: Response) => {
  const { id } = req.params;
  const ALLOWED = ['estado', 'hora_inicio', 'hora_fin', 'turno', 'tipo_oc', 'tipo_oc_id'];
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
