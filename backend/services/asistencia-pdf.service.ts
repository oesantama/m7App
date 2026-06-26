import puppeteer from 'puppeteer';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH  = path.resolve(__dirname, '../../public/logo-encuesta.png');
const RCLONE_REMOTE = 'gdrive_cumplidos';

export interface AsistenciaRow {
  nombre_completo: string;
  cedula: string;
  cargo?: string;
  firma_b64?: string;
  fecha_registro: string | Date;
}

export interface AsistenciaConfig {
  titulo: string;
  subtitulo?: string;
  instructor?: string;
  tipo?: string;
  fecha_sesion?: string;
}

function getLogoBase64(): string {
  try {
    return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
  } catch { return ''; }
}

function fmtFecha(d: string | Date): string {
  try {
    return new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(d); }
}

function buildHtml(rows: AsistenciaRow[], cfg: AsistenciaConfig, logoSrc: string): string {
  const filas = rows.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="nombre">${r.nombre_completo.toUpperCase()}</td>
      <td class="cedula">${r.cedula}</td>
      <td class="cargo">${(r.cargo || '—').toUpperCase()}</td>
      <td class="fecha">${fmtFecha(r.fecha_registro)}</td>
      <td class="firma">${r.firma_b64 ? `<img src="${r.firma_b64}" alt="firma" />` : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 9px; color: #1a2a2a; background: #fff; padding: 18px 22px; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0d3b3b; padding-bottom: 12px; margin-bottom: 12px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .logo { height: 44px; object-fit: contain; }
  .header-title { }
  .header-title h1 { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; letter-spacing: 0.04em; }
  .header-title p  { font-size: 8px; color: #5a8080; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .badge { background: #0d3b3b; color: #fff; font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 10px; border-radius: 20px; }
  .header-right .fecha-gen { font-size: 7.5px; color: #80a0a0; margin-top: 4px; }

  .meta { background: #f0f7f7; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; gap: 24px; flex-wrap: wrap; }
  .meta-item { }
  .meta-item span { display: block; font-size: 7px; font-weight: 900; text-transform: uppercase; color: #80a0a0; letter-spacing: 0.1em; }
  .meta-item strong { font-size: 9.5px; color: #0d3b3b; font-weight: 900; text-transform: uppercase; }

  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead tr { background: #0d3b3b; color: #fff; }
  thead th { padding: 7px 6px; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; }
  thead th.num { width: 28px; text-align: center; }
  thead th.firma { width: 90px; text-align: center; }
  tbody tr { border-bottom: 1px solid #e8f0f0; }
  tbody tr:nth-child(even) { background: #f8fdfd; }
  tbody td { padding: 6px 6px; vertical-align: middle; }
  td.num { text-align: center; font-weight: 900; color: #0d3b3b; }
  td.nombre { font-weight: 700; color: #1a2a2a; }
  td.cedula { font-family: monospace; font-size: 8.5px; color: #2a5555; }
  td.cargo { color: #4a6a6a; }
  td.fecha { font-size: 7.5px; color: #607070; white-space: nowrap; }
  td.firma { text-align: center; }
  td.firma img { max-height: 32px; max-width: 80px; object-fit: contain; }

  .empty { text-align: center; padding: 20px; color: #80a0a0; font-size: 9px; font-style: italic; }

  .footer { margin-top: 18px; border-top: 1px solid #dde8e8; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .footer span { font-size: 7px; color: #80a0a0; }
  .footer strong { color: #0d3b3b; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Milla Siete" />` : ''}
      <div class="header-title">
        <h1>Lista de Asistencia</h1>
        <p>Milla 7 S.A.S. — OrbitM7 Gestión Logística</p>
      </div>
    </div>
    <div class="header-right">
      <div class="badge">Documento Oficial</div>
      <div class="fecha-gen">Generado: ${fmtFecha(new Date())}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><span>Capacitación / Aviso</span><strong>${cfg.titulo}</strong></div>
    ${cfg.instructor ? `<div class="meta-item"><span>Instructor</span><strong>${cfg.instructor}</strong></div>` : ''}
    ${cfg.tipo       ? `<div class="meta-item"><span>Tipo</span><strong>${cfg.tipo}</strong></div>` : ''}
    ${cfg.fecha_sesion ? `<div class="meta-item"><span>Fecha Sesión</span><strong>${cfg.fecha_sesion}</strong></div>` : ''}
    <div class="meta-item"><span>Total Asistentes</span><strong>${rows.length}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Nombre Completo</th>
        <th>Cédula</th>
        <th>Cargo</th>
        <th>Fecha Registro</th>
        <th class="firma">Firma</th>
      </tr>
    </thead>
    <tbody>
      ${filas || `<tr><td colspan="6" class="empty">Sin registros de asistencia.</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    <span>OrbitM7 — <strong>Milla 7 S.A.S.</strong> | MILLA SIE7E GRUPO LOGÍSTICO</span>
    <span>Total: <strong>${rows.length}</strong> asistentes registrados</span>
  </div>
</body>
</html>`;
}

export async function generateAsistenciaPDF(rows: AsistenciaRow[], cfg: AsistenciaConfig): Promise<Buffer> {
  const logoSrc = getLogoBase64();
  const html = buildHtml(rows, cfg, logoSrc);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function sanitizeDrive(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().toUpperCase().slice(0, 60);
}

async function rcloneMkdir(remotePath: string): Promise<void> {
  return new Promise((resolve) => {
    exec(`rclone mkdir "${RCLONE_REMOTE}:${remotePath}"`, (err) => {
      if (err) console.error('[ASIST-DRIVE] mkdir error:', err.message);
      resolve();
    });
  });
}

async function rcloneCopyto(localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`rclone copyto "${localPath}" "${RCLONE_REMOTE}:${remotePath}"`, (err, _out, stderr) => {
      if (err) { console.error('[ASIST-DRIVE] copyto error:', stderr); reject(err); }
      else resolve();
    });
  });
}

async function rcloneLink(remotePath: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const link = await new Promise<string>((resolve) => {
      exec(`rclone link "${RCLONE_REMOTE}:${remotePath}"`, (_err, stdout) => resolve(stdout?.trim() || ''));
    });
    if (link) return link;
    await new Promise(r => setTimeout(r, 1500));
  }
  return '';
}


// PDF de asistencia separado en NOTICIAS MILLA 7/{TITULO}/ (sin fusionar con el adjunto original)
export async function autoUploadNoticiaAsistencia(opts: {
  titulo: string;
  archivoDrivePath: string | null;
  rows: AsistenciaRow[];
  cfg: AsistenciaConfig;
}): Promise<{ drive_path: string; drive_link: string }> {
  const { titulo, rows, cfg } = opts;
  const attendancePdf = await generateAsistenciaPDF(rows, cfg);

  const safe   = sanitizeDrive(titulo);
  const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const folder = `NOTICIAS MILLA 7/${safe}`;
  const fname  = `${safe.replace(/ /g, '_')}_ASISTENCIA_${today}.pdf`;
  const remote = `${folder}/${fname}`;

  const tmp = path.join(os.tmpdir(), `noticia_asist_${Date.now()}.pdf`);
  fs.writeFileSync(tmp, attendancePdf);
  try {
    await rcloneMkdir(folder);
    await rcloneCopyto(tmp, remote);
    const link = await rcloneLink(remote);
    return { drive_path: remote, drive_link: link };
  } finally {
    fs.unlink(tmp, () => {});
  }
}

export async function uploadAsistenciaToDrive(
  pdfBuffer: Buffer,
  titulo: string,
): Promise<{ drive_path: string; drive_link: string }> {
  const safe   = sanitizeDrive(titulo);
  const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const folder = `ASISTENCIA CAPACITACIONES/${safe}`;
  const fname  = `${safe.replace(/ /g, '_')}_ASISTENCIA_${today}.pdf`;
  const remote = `${folder}/${fname}`;

  const tmp = path.join(os.tmpdir(), `asist_${Date.now()}.pdf`);
  fs.writeFileSync(tmp, pdfBuffer);
  try {
    await rcloneMkdir(folder);
    await rcloneCopyto(tmp, remote);
    const link = await rcloneLink(remote);
    return { drive_path: remote, drive_link: link };
  } finally {
    fs.unlink(tmp, () => {});
  }
}
