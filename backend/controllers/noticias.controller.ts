import { Request, Response } from 'express';
import pool from '../config/database.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { generateAsistenciaPDF, uploadAsistenciaToDrive, autoUploadNoticiaAsistencia, appendRowsToExistingPdf } from '../services/asistencia-pdf.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIVE_BASE    = 'NOTICIAS MILLA 7';
const RCLONE_REMOTE = 'gdrive_cumplidos';
// Carpeta local para cuando rclone no está disponible (dev local)
// __dirname = backend/controllers → ../docs/noticias = backend/docs/noticias (dentro del volumen)
const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../docs/noticias');

// Detectar si rclone está disponible (se cachea en el primer uso)
let _rcloneAvailable: boolean | null = null;
async function rcloneAvailable(): Promise<boolean> {
  if (_rcloneAvailable !== null) return _rcloneAvailable;
  return new Promise((resolve) => {
    exec('which rclone', (err) => {
      _rcloneAvailable = !err;
      if (!_rcloneAvailable) console.warn('[NOTICIAS] rclone no encontrado — usando almacenamiento local (modo desarrollo)');
      resolve(_rcloneAvailable!);
    });
  });
}

function sanitize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().toUpperCase();
}

async function rcloneMkdir(remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    exec(`rclone mkdir "${RCLONE_REMOTE}:${remotePath}"`, (err) => {
      if (err) console.error('[NOTICIAS-DRIVE] mkdir error:', err.message);
      resolve();
    });
  });
}

async function rcloneCopyto(localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`rclone copyto "${localPath}" "${RCLONE_REMOTE}:${remotePath}"`, (err, _stdout, stderr) => {
      if (err) { console.error('[NOTICIAS-DRIVE] copyto error:', stderr); reject(err); }
      else resolve();
    });
  });
}

async function rcloneLink(remotePath: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const link = await new Promise<string>((resolve) => {
      exec(`rclone link "${RCLONE_REMOTE}:${remotePath}"`, (err, stdout) => {
        resolve(stdout ? stdout.trim() : '');
      });
    });
    if (link) return link;
    await new Promise(r => setTimeout(r, 1500));
  }
  return '';
}

async function rcloneDeleteFile(remotePath: string): Promise<void> {
  await new Promise<void>((resolve) => {
    exec(`rclone deletefile "${RCLONE_REMOTE}:${remotePath}"`, () => resolve());
  });
}

async function rcloneCopyFrom(remotePath: string, localPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`rclone copyto "${RCLONE_REMOTE}:${remotePath}" "${localPath}"`, (err, _stdout, stderr) => {
      if (err) { console.error('[NOTICIAS-DRIVE] copyfrom error:', stderr); reject(err); }
      else resolve();
    });
  });
}

// Subida con fallback local cuando rclone no está disponible
// remotePath puede incluir subcarpetas: crea el directorio padre automáticamente
async function uploadFile(fileBuffer: Buffer, fileName: string, remotePath: string): Promise<{ archivo_drive_path: string; drive_link: string }> {
  const hasRclone = await rcloneAvailable();
  if (hasRclone) {
    const tmp = path.join(os.tmpdir(), fileName);
    try {
      fs.writeFileSync(tmp, fileBuffer);
      // Crear carpeta padre (puede incluir subcarpetas como NOTICIAS MILLA 7/{TITULO})
      const folder = remotePath.includes('/') ? remotePath.split('/').slice(0, -1).join('/') : DRIVE_BASE;
      await rcloneMkdir(folder);
      await rcloneCopyto(tmp, remotePath);
      const link = await rcloneLink(remotePath);
      return { archivo_drive_path: remotePath, drive_link: link };
    } finally {
      fs.unlink(tmp, () => {});
    }
  }

  // Fallback local
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const localFile = path.join(LOCAL_UPLOAD_DIR, fileName);
  fs.writeFileSync(localFile, fileBuffer);
  return { archivo_drive_path: `local:${fileName}`, drive_link: '' };
}

// ── ADMIN: listar ──────────────────────────────────────────────────────────────
export const getNoticias = async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`SELECT * FROM noticias ORDER BY fecha_control DESC`);
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
};

// ── ADMIN: crear / editar ──────────────────────────────────────────────────────
export const saveNoticia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { titulo, descripcion, link, archivo_drive_id, archivo_drive_path,
    archivo_nombre, archivo_tipo, tipo_acceso, fecha_vencimiento, estado,
    usuario_control, permite_asistencia } = req.body;

  if (!titulo) return res.status(400).json({ error: 'El título es requerido' });
  const permiteAsist = permite_asistencia === true || permite_asistencia === 'true';

  try {
    if (id) {
      await pool.query(`
        UPDATE noticias SET titulo=$1, descripcion=$2, link=$3,
          archivo_drive_id=$4, archivo_drive_path=$5, archivo_nombre=$6, archivo_tipo=$7,
          tipo_acceso=$8, fecha_vencimiento=$9, estado=$10, usuario_control=$11,
          permite_asistencia=$12, fecha_control=NOW()
        WHERE id=$13`,
        [titulo, descripcion || null, link || null,
         archivo_drive_id || null, archivo_drive_path || null, archivo_nombre || null, archivo_tipo || null,
         tipo_acceso || 'AMBOS', fecha_vencimiento || null, estado || 'ACTIVO', usuario_control || null,
         permiteAsist, id]);
      res.json({ ok: true });
    } else {
      const r = await pool.query(`
        INSERT INTO noticias (titulo, descripcion, link, archivo_drive_id, archivo_drive_path,
          archivo_nombre, archivo_tipo, tipo_acceso, fecha_vencimiento, estado, usuario_control, permite_asistencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [titulo, descripcion || null, link || null,
         archivo_drive_id || null, archivo_drive_path || null, archivo_nombre || null, archivo_tipo || null,
         tipo_acceso || 'AMBOS', fecha_vencimiento || null, estado || 'ACTIVO', usuario_control || null,
         permiteAsist]);
      res.json({ ok: true, id: r.rows[0].id });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── ADMIN: eliminar solo el archivo adjunto del Drive ─────────────────────────
export const deleteArchivoNoticia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`SELECT archivo_drive_path FROM noticias WHERE id=$1`, [id]);
    const drivePath = r.rows[0]?.archivo_drive_path;
    if (drivePath) {
      await rcloneDeleteFile(drivePath).catch(() => {});
    }
    await pool.query(`
      UPDATE noticias SET archivo_drive_path=NULL, archivo_drive_id=NULL,
        archivo_nombre=NULL, archivo_tipo=NULL, fecha_control=NOW()
      WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── ADMIN: eliminar ────────────────────────────────────────────────────────────
export const deleteNoticia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`SELECT archivo_drive_path FROM noticias WHERE id=$1`, [id]);
    if (r.rows[0]?.archivo_drive_path) {
      await rcloneDeleteFile(r.rows[0].archivo_drive_path).catch(() => {});
    }
    await pool.query(`DELETE FROM noticias WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── ADMIN: subir archivo al Drive (con fallback local) ───────────────────────
export const uploadArchivoNoticia = async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'No se recibió archivo' });

  const ext = path.extname(file.originalname);
  const safeName = sanitize(path.basename(file.originalname, ext)) || 'archivo';
  const fileName = `${safeName}_${Date.now()}${ext}`;

  // Si viene titulo, poner el archivo en subcarpeta NOTICIAS MILLA 7/{TITULO}/
  const tituloRaw: string = (req.body as any)?.titulo || '';
  const remotePath = tituloRaw.trim()
    ? `${DRIVE_BASE}/${sanitize(tituloRaw)}/${fileName}`
    : `${DRIVE_BASE}/${fileName}`;

  let tipo = 'IMAGEN';
  const mime = file.mimetype.toLowerCase();
  if (mime.includes('pdf')) tipo = 'PDF';
  else if (mime.includes('video')) tipo = 'VIDEO';
  else if (mime.includes('image')) tipo = 'IMAGEN';

  try {
    const { archivo_drive_path, drive_link } = await uploadFile(file.buffer, fileName, remotePath);
    res.json({
      ok: true,
      archivo_drive_path,
      archivo_nombre: file.originalname,
      archivo_tipo: tipo,
      drive_link,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── APP FEED: noticias activas para usuarios autenticados ─────────────────────
export const getNoticiasApp = async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT * FROM noticias
      WHERE estado = 'ACTIVO'
        AND tipo_acceso IN ('INTERNO','AMBOS')
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
      ORDER BY fecha_control DESC
    `);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// ── PUBLIC FEED: noticias activas para acceso externo ─────────────────────────
export const getNoticiasPublicas = async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT * FROM noticias
      WHERE estado = 'ACTIVO'
        AND tipo_acceso IN ('EXTERNO','AMBOS')
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
      ORDER BY fecha_control DESC
    `);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// ── PUBLIC: noticia individual por ID ────────────────────────────────────────
export const getNoticiaPublicaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`
      SELECT * FROM noticias
      WHERE id=$1 AND estado='ACTIVO'
        AND tipo_acceso IN ('EXTERNO','AMBOS')
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Noticia no disponible' });
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Error' }); }
};

// ── STREAM archivo desde Drive (o local en dev) ───────────────────────────────
export const streamArchivoNoticia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`SELECT archivo_drive_path, archivo_nombre, archivo_tipo FROM noticias WHERE id=$1`, [id]);
    if (!r.rows.length || !r.rows[0].archivo_drive_path) return res.status(404).json({ error: 'No encontrado' });
    const { archivo_drive_path, archivo_nombre, archivo_tipo } = r.rows[0];

    const mimeMap: Record<string, string> = {
      PDF: 'application/pdf', VIDEO: 'video/mp4', IMAGEN: 'image/jpeg',
    };
    const contentType = mimeMap[archivo_tipo] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${archivo_nombre || 'archivo'}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');

    // Ruta local (modo desarrollo sin rclone)
    if (archivo_drive_path.startsWith('local:')) {
      const localFile = path.join(LOCAL_UPLOAD_DIR, archivo_drive_path.slice(6));
      if (!fs.existsSync(localFile)) return res.status(404).json({ error: 'Archivo local no encontrado' });
      return res.sendFile(localFile);
    }

    const { spawn } = await import('child_process');
    const proc = spawn('rclone', ['cat', `${RCLONE_REMOTE}:${archivo_drive_path}`]);
    proc.stdout.pipe(res);
    proc.stderr.on('data', (d) => console.error('[NOTICIAS-STREAM]', d.toString()));
    proc.on('error', () => res.status(500).end());
  } catch {
    res.status(500).json({ error: 'Error al transmitir archivo' });
  }
};

// ── ASISTENCIA DE NOTICIAS ────────────────────────────────────────────────────

export const getNoticiaAsistencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT * FROM noticia_asistencia WHERE noticia_id = $1 ORDER BY fecha_registro ASC',
      [id]
    );
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
};

export const checkNoticiaAsistencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { cedula } = req.query as { cedula?: string };
  if (!cedula) return res.status(400).json({ error: 'cedula requerida' });
  try {
    const r = await pool.query(
      'SELECT nombre_completo, fecha_registro FROM noticia_asistencia WHERE noticia_id=$1 AND cedula=$2',
      [id, cedula.trim()]
    );
    if (r.rowCount) {
      res.json({ registered: true, nombre: r.rows[0].nombre_completo, fecha: r.rows[0].fecha_registro });
    } else {
      res.json({ registered: false });
    }
  } catch {
    res.status(500).json({ error: 'Error verificando asistencia' });
  }
};

export const registerNoticiaAsistencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nombre_completo, cedula, cargo, firma_b64 } = req.body;
  if (!nombre_completo || !cedula) return res.status(400).json({ error: 'Nombre y cédula son requeridos' });
  if (!firma_b64) return res.status(400).json({ error: 'La firma es obligatoria' });
  try {
    // Verificar si ya está registrado
    const exists = await pool.query(
      'SELECT nombre_completo FROM noticia_asistencia WHERE noticia_id=$1 AND cedula=$2',
      [id, cedula.trim()]
    );
    if (exists.rowCount) {
      return res.status(409).json({
        error: 'Ya registraste tu asistencia',
        already_registered: true,
        nombre: exists.rows[0].nombre_completo,
      });
    }

    const r = await pool.query(
      `INSERT INTO noticia_asistencia (noticia_id, nombre_completo, cedula, cargo, firma_b64)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, nombre_completo.trim(), cedula.trim(), cargo?.trim() || null, firma_b64 || null]
    );
    res.json(r.rows[0]);

    // Auto-upload a Drive en background (no bloquea la respuesta)
    triggerNoticiaAsistenciaDrive(Number(id)).catch(e =>
      console.error('[NOTICIAS-ASIST-AUTO]', e.message)
    );
  } catch (e: any) {
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
};

async function triggerNoticiaAsistenciaDrive(noticiaId: number): Promise<void> {
  if (!(await rcloneAvailable())) {
    console.log('[NOTICIAS-ASIST-AUTO] rclone no disponible, omitiendo Drive upload');
    return;
  }
  const noticia = await pool.query(
    'SELECT titulo, permite_asistencia, asistencia_drive_path FROM noticias WHERE id=$1',
    [noticiaId]
  );
  if (!noticia.rowCount || !noticia.rows[0].permite_asistencia) return;
  const n = noticia.rows[0];

  // Filas firmadas que aún no se han incorporado al PDF de Drive
  const pendingRes = await pool.query(
    'SELECT id, nombre_completo, cedula, cargo, firma_b64, fecha_registro FROM noticia_asistencia WHERE noticia_id=$1 AND firma_b64 IS NOT NULL ORDER BY fecha_registro ASC',
    [noticiaId]
  );
  if (!pendingRes.rowCount) {
    console.log(`[NOTICIAS-ASIST] Sin firmas pendientes para noticia ${noticiaId}, omitiendo upload`);
    return;
  }
  const pendingRows = pendingRes.rows;
  const pendingIds  = pendingRows.map(r => r.id);

  let drivePath: string | null = n.asistencia_drive_path;
  const cfg = { titulo: n.titulo };

  if (!drivePath) {
    // Primera vez: generar el PDF completo (con encabezado) con las filas pendientes
    const result = await autoUploadNoticiaAsistencia({
      titulo: n.titulo,
      archivoDrivePath: null,
      rows: pendingRows,
      cfg,
    });
    drivePath = result.drive_path;
  } else {
    // Ya existe un PDF en Drive: descargarlo, generar SOLO la página con las filas
    // nuevas y fusionarla al final — el contenido ya subido no se vuelve a tocar.
    const totalRes = await pool.query('SELECT COUNT(*) FROM noticia_asistencia WHERE noticia_id=$1', [noticiaId]);
    const startIndex = parseInt(totalRes.rows[0].count) - pendingRows.length;

    const tmpExisting = path.join(os.tmpdir(), `noticia_asist_existing_${noticiaId}_${Date.now()}.pdf`);
    const tmpMerged    = path.join(os.tmpdir(), `noticia_asist_merged_${noticiaId}_${Date.now()}.pdf`);
    try {
      await rcloneCopyFrom(drivePath, tmpExisting);
      const existingBytes = fs.readFileSync(tmpExisting);
      const mergedBytes = await appendRowsToExistingPdf(existingBytes, pendingRows, cfg, startIndex);
      fs.writeFileSync(tmpMerged, mergedBytes);
      await rcloneCopyto(tmpMerged, drivePath);
    } finally {
      fs.unlink(tmpExisting, () => {});
      fs.unlink(tmpMerged, () => {});
    }
  }

  await pool.query('UPDATE noticias SET asistencia_drive_path=$1 WHERE id=$2', [drivePath, noticiaId]);
  // Las firmas ya quedaron incrustadas permanentemente en las páginas del PDF de Drive —
  // ahora sí es seguro limpiarlas, pero SOLO las que se acaban de incorporar en esta corrida.
  await pool.query('UPDATE noticia_asistencia SET firma_b64 = NULL WHERE id = ANY($1::int[])', [pendingIds]);
  console.log(`[NOTICIAS-ASIST] Drive actualizado para noticia ${noticiaId} (+${pendingRows.length} registros incorporados)`);
}

export const deleteNoticiaAsistencia = async (req: Request, res: Response) => {
  const { asistId } = req.params;
  try {
    await pool.query('DELETE FROM noticia_asistencia WHERE id = $1', [asistId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Error al eliminar registro' });
  }
};

export const downloadNoticiaAsistenciaPDF = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const noticia = await pool.query('SELECT titulo, asistencia_drive_path FROM noticias WHERE id = $1', [id]);
    if (!noticia.rowCount) return res.status(404).json({ error: 'Noticia no encontrada' });
    const n = noticia.rows[0];

    // El PDF ya se mantiene actualizado en Drive en cada firma (triggerNoticiaAsistenciaDrive
    // corre en background al registrar asistencia) — este botón solo sirve el archivo, no
    // regenera ni sincroniza nada.
    const drivePath: string | null = n.asistencia_drive_path || null;

    const safeName = n.titulo.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Asistencia_${safeName}.pdf"`,
    });

    // Bajar directamente desde Drive si existe la ruta
    if (drivePath && !drivePath.startsWith('local:') && await rcloneAvailable()) {
      console.log(`[NOTICIAS-ASIST-PDF] Sirviendo desde Drive: ${drivePath}`);
      const { spawn } = await import('child_process');
      const proc = spawn('rclone', ['cat', `${RCLONE_REMOTE}:${drivePath}`]);
      proc.stdout.pipe(res);
      proc.stderr.on('data', (d) => console.error('[NOTICIAS-ASIST-PDF-STREAM]', d.toString()));
      proc.on('error', () => res.status(500).end());
      return;
    }

    // Fallback: generar desde DB (sin firmas si ya fueron limpiadas)
    console.warn(`[NOTICIAS-ASIST-PDF] Sin ruta Drive para noticia ${id}, generando desde DB`);
    const attRes = await pool.query(
      'SELECT nombre_completo, cedula, cargo, firma_b64, fecha_registro FROM noticia_asistencia WHERE noticia_id = $1 ORDER BY fecha_registro ASC',
      [id]
    );
    const pdf = await generateAsistenciaPDF(attRes.rows, { titulo: n.titulo });
    res.send(pdf);
  } catch (e: any) {
    console.error('[NOTICIAS-ASIST-PDF]', e.message);
    res.status(500).json({ error: 'Error generando PDF' });
  }
};

export const uploadNoticiaAsistenciaToDrive = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const noticia = await pool.query('SELECT * FROM noticias WHERE id = $1', [id]);
    if (!noticia.rowCount) return res.status(404).json({ error: 'Noticia no encontrada' });
    const n = noticia.rows[0];

    const attRes = await pool.query(
      'SELECT nombre_completo, cedula, cargo, firma_b64, fecha_registro FROM noticia_asistencia WHERE noticia_id = $1 ORDER BY fecha_registro ASC',
      [id]
    );

    const pdf = await generateAsistenciaPDF(attRes.rows, { titulo: n.titulo });
    const { drive_path, drive_link } = await uploadAsistenciaToDrive(pdf, n.titulo);
    res.json({ success: true, drive_path, drive_link, total: attRes.rowCount });
  } catch (e: any) {
    console.error('[NOTICIAS-ASIST-DRIVE]', e.message);
    res.status(500).json({ error: 'Error subiendo PDF a Drive' });
  }
};
