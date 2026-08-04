import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-encuesta.png');

export interface ActaInventarioData {
  serial_number: string;
  hostname?: string;
  system_user?: string;
  brand?: string;
  model?: string;
  os_name?: string;
  os_version?: string;
  os_license_status?: string;
  office_version?: string;
  office_license_status?: string;
  peripherals?: string[] | null;
  assigned_to_name?: string;
  assigned_to_id?: string;
  department?: string;
  location?: string;
  physical_condition?: string;
  notes?: string;
  conformity_accepted?: boolean;
  updated_at?: string | Date;
}

function getLogoBase64(): string {
  try {
    return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
  } catch {
    return '';
  }
}

function fmtFecha(d: string | Date | undefined): string {
  try {
    return new Date(d || Date.now()).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(d || '');
  }
}

function buildHtml(data: ActaInventarioData, logoSrc: string): string {
  const periféricos = Array.isArray(data.peripherals) && data.peripherals.length > 0
    ? data.peripherals.map(p => `<li>${p}</li>`).join('')
    : '<li>Ninguno registrado</li>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 10px; color: #1a2a2a; background: #fff; padding: 22px 26px; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0d3b3b; padding-bottom: 12px; margin-bottom: 16px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .logo { height: 48px; object-fit: contain; }
  .header-title h1 { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; letter-spacing: 0.03em; }
  .header-title p { font-size: 8.5px; color: #5a8080; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
  .header-right { text-align: right; }
  .header-right .badge { background: #0d3b3b; color: #fff; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 20px; }
  .header-right .fecha-gen { font-size: 8px; color: #80a0a0; margin-top: 4px; }

  h2.section { font-size: 10.5px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; letter-spacing: 0.05em; margin: 16px 0 8px; border-left: 4px solid #0d3b3b; padding-left: 8px; }

  .meta { background: #f0f7f7; border-radius: 8px; padding: 12px 16px; display: flex; gap: 22px; flex-wrap: wrap; }
  .meta-item span { display: block; font-size: 7.5px; font-weight: 900; text-transform: uppercase; color: #80a0a0; letter-spacing: 0.08em; }
  .meta-item strong { font-size: 10.5px; color: #0d3b3b; font-weight: 900; text-transform: uppercase; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 7px 8px; font-size: 9px; text-align: left; border-bottom: 1px solid #e8f0f0; }
  th { background: #0d3b3b; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; font-size: 8px; }
  td.label { font-weight: 700; color: #5a8080; width: 220px; }

  ul.periféricos { list-style: none; }
  ul.periféricos li { padding: 3px 0 3px 14px; position: relative; font-size: 9.5px; }
  ul.periféricos li::before { content: '•'; position: absolute; left: 0; color: #0d3b3b; font-weight: 900; }

  .conformidad { margin-top: 22px; border: 1px solid #d6e6e6; border-radius: 8px; padding: 14px 16px; }
  .conformidad .check { display: inline-block; width: 14px; height: 14px; border: 2px solid #0d3b3b; border-radius: 3px; text-align: center; line-height: 12px; font-weight: 900; margin-right: 6px; }
  .firma-line { margin-top: 30px; display: flex; justify-content: space-between; }
  .firma-box { width: 45%; text-align: center; border-top: 1px solid #0d3b3b; padding-top: 6px; font-size: 8.5px; color: #5a8080; text-transform: uppercase; letter-spacing: 0.05em; }

  .footer { margin-top: 26px; text-align: center; font-size: 7.5px; color: #80a0a0; border-top: 1px solid #e8f0f0; padding-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo" />` : ''}
      <div class="header-title">
        <h1>Acta de Asignación e Inventario de Activos Tecnológicos</h1>
        <p>Milla 7 S.A.S. — OrbitM7</p>
      </div>
    </div>
    <div class="header-right">
      <div class="badge">Serial: ${data.serial_number}</div>
      <div class="fecha-gen">Generado: ${fmtFecha(new Date())}</div>
    </div>
  </div>

  <h2 class="section">Datos del Custodio</h2>
  <div class="meta">
    <div class="meta-item"><span>Nombre completo</span><strong>${data.assigned_to_name || '—'}</strong></div>
    <div class="meta-item"><span>Documento de identidad</span><strong>${data.assigned_to_id || '—'}</strong></div>
    <div class="meta-item"><span>Área / Departamento</span><strong>${data.department || '—'}</strong></div>
    <div class="meta-item"><span>Ubicación</span><strong>${data.location || '—'}</strong></div>
    <div class="meta-item"><span>Estado físico del equipo</span><strong>${data.physical_condition || '—'}</strong></div>
  </div>

  <h2 class="section">Hardware y Equipo</h2>
  <table>
    <tr><td class="label">Marca / Modelo</td><td>${data.brand || '—'} ${data.model || ''}</td></tr>
    <tr><td class="label">Número de serie</td><td>${data.serial_number}</td></tr>
    <tr><td class="label">Nombre de equipo (Hostname)</td><td>${data.hostname || '—'}</td></tr>
    <tr><td class="label">Usuario del sistema</td><td>${data.system_user || '—'}</td></tr>
  </table>

  <h2 class="section">Licenciamiento</h2>
  <table>
    <tr><th>Producto</th><th>Versión</th><th>Estado de Licencia</th></tr>
    <tr><td>Sistema Operativo</td><td>${data.os_name || '—'} ${data.os_version || ''}</td><td>${data.os_license_status || '—'}</td></tr>
    <tr><td>Microsoft Office</td><td>${data.office_version || '—'}</td><td>${data.office_license_status || '—'}</td></tr>
  </table>

  <h2 class="section">Periféricos Conectados</h2>
  <ul class="periféricos">${periféricos}</ul>

  ${data.notes ? `<h2 class="section">Observaciones</h2><p style="font-size:9.5px;">${data.notes}</p>` : ''}

  <div class="conformidad">
    <span class="check">${data.conformity_accepted ? '✓' : ''}</span>
    <span style="font-size:9.5px;">El custodio confirma haber recibido el equipo descrito y acepta la conformidad del presente inventario.</span>
    <div class="firma-line">
      <div class="firma-box">${data.assigned_to_name || '—'}<br/>C.C. ${data.assigned_to_id || '—'}</div>
      <div class="firma-box">${fmtFecha(data.updated_at)}<br/>Fecha de conformidad</div>
    </div>
  </div>

  <div class="footer">
    OrbitM7 — Plataforma de Gestión Logística · Milla 7 S.A.S. · Soporte: directorti@millasiete.com · WhatsApp 3011825161
  </div>
</body>
</html>`;
}

export async function generateActaInventarioPdf(data: ActaInventarioData): Promise<Buffer> {
  const logoSrc = getLogoBase64();
  const html = buildHtml(data, logoSrc);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
