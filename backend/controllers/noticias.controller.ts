import { Request, Response } from 'express';
import pool from '../config/database.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DRIVE_BASE = 'NOTICIAS MILLA 7';
const RCLONE_REMOTE = 'gdrive_cumplidos';

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
    archivo_nombre, archivo_tipo, tipo_acceso, fecha_vencimiento, estado, usuario_control } = req.body;

  if (!titulo) return res.status(400).json({ error: 'El título es requerido' });

  try {
    if (id) {
      await pool.query(`
        UPDATE noticias SET titulo=$1, descripcion=$2, link=$3,
          archivo_drive_id=$4, archivo_drive_path=$5, archivo_nombre=$6, archivo_tipo=$7,
          tipo_acceso=$8, fecha_vencimiento=$9, estado=$10, usuario_control=$11,
          fecha_control=NOW()
        WHERE id=$12`,
        [titulo, descripcion || null, link || null,
         archivo_drive_id || null, archivo_drive_path || null, archivo_nombre || null, archivo_tipo || null,
         tipo_acceso || 'AMBOS', fecha_vencimiento || null, estado || 'ACTIVO', usuario_control || null, id]);
      res.json({ ok: true });
    } else {
      const r = await pool.query(`
        INSERT INTO noticias (titulo, descripcion, link, archivo_drive_id, archivo_drive_path,
          archivo_nombre, archivo_tipo, tipo_acceso, fecha_vencimiento, estado, usuario_control)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [titulo, descripcion || null, link || null,
         archivo_drive_id || null, archivo_drive_path || null, archivo_nombre || null, archivo_tipo || null,
         tipo_acceso || 'AMBOS', fecha_vencimiento || null, estado || 'ACTIVO', usuario_control || null]);
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

// ── ADMIN: subir archivo al Drive ─────────────────────────────────────────────
export const uploadArchivoNoticia = async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'No se recibió archivo' });

  const ext = path.extname(file.originalname);
  const safeName = sanitize(path.basename(file.originalname, ext)) || 'archivo';
  const fileName = `${safeName}_${Date.now()}${ext}`;
  const remotePath = `${DRIVE_BASE}/${fileName}`;

  const tmp = path.join(os.tmpdir(), fileName);
  try {
    fs.writeFileSync(tmp, file.buffer);
    await rcloneMkdir(DRIVE_BASE);
    await rcloneCopyto(tmp, remotePath);
    const driveLink = await rcloneLink(remotePath);

    let tipo = 'IMAGEN';
    const mime = file.mimetype.toLowerCase();
    if (mime.includes('pdf')) tipo = 'PDF';
    else if (mime.includes('video')) tipo = 'VIDEO';
    else if (mime.includes('image')) tipo = 'IMAGEN';

    res.json({
      ok: true,
      archivo_drive_path: remotePath,
      archivo_nombre: file.originalname,
      archivo_tipo: tipo,
      drive_link: driveLink,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(tmp, () => {});
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

// ── STREAM archivo desde Drive ─────────────────────────────────────────────────
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

    const { spawn } = await import('child_process');
    const proc = spawn('rclone', ['cat', `${RCLONE_REMOTE}:${archivo_drive_path}`]);
    proc.stdout.pipe(res);
    proc.stderr.on('data', (d) => console.error('[NOTICIAS-STREAM]', d.toString()));
    proc.on('error', () => res.status(500).end());
  } catch {
    res.status(500).json({ error: 'Error al transmitir archivo' });
  }
};
