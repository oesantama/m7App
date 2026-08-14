import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerfilCargoContenido } from './gh-perfiles-cargo-parser.service.js';
import { LOGO_MILLA_SIETE_B64 } from './logo-milla-siete.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface FirmaData {
  nombre: string;
  cedula: string;
  firma_b64: string;
  firmado_at: string | Date;
  ip?: string;
}

function getLogoBase64(): string {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'public/logo-encuesta.png'),
      path.resolve(process.cwd(), 'public/logo-m7.png'),
      path.resolve(__dirname, '../../public/logo-encuesta.png'),
      path.resolve(__dirname, '../../public/logo-m7.png'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const b64 = fs.readFileSync(p).toString('base64');
        if (b64) return `data:image/png;base64,${b64}`;
      }
    }
  } catch {}
  
  // Constante embebida oficial de Milla Siete Grupo Logístico
  return LOGO_MILLA_SIETE_B64;
}

function fmtFecha(d: string | Date | undefined): string {
  try {
    return new Date(d || Date.now()).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(d || '');
  }
}

const nl2br = (s: string) => (s || '').replace(/\n/g, '<br/>');

function formatCurrencyCOP(val: string | number | undefined): string {
  if (!val) return '—';
  const str = String(val).trim();
  if (!str) return '—';
  if (str.startsWith('$')) return str;

  // Si contiene solo texto (ej. "Reservado", "A convenir", "No aplica") sin números
  const digitsOnly = str.replace(/[^\d]/g, '');
  if (!digitsOnly) return str;

  const clean = str.replace(/[^\d.,]/g, '');
  const num = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  if (!isNaN(num) && num > 0) {
    const formatted = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `$ ${formatted}`;
  }
  return str;
}

function formatBulletText(text: string): string {
  if (!text) return '—';
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Dividir por saltos de línea O por caracteres de viñeta ('•', '\u2022', '\t')
  const rawParts = clean.split(/(?:\r?\n|[•\u2022])+/);
  const items = rawParts
    .map(l => l.replace(/^[•\u2022\-\*\t\s]+/, '').trim())
    .filter(Boolean);

  if (items.length > 1 || (items.length === 1 && (clean.includes('•') || clean.includes('\u2022')))) {
    return `<ul class="bullet-list">${items.map(it => `<li>${it}</li>`).join('')}</ul>`;
  }

  return nl2br(clean);
}

function renderResponsabilidadRows(respItems: { left: string; right: string }[]): string {
  if (!respItems || respItems.length === 0) return '';

  let html = '';
  const checkRows: { left: string; right: string }[] = [];

  for (const item of respItems) {
    const l = item.left ? item.left.trim() : '';
    const r = item.right ? item.right.trim() : '';

    const isCheckItem = (
      l.toLowerCase().includes('dinero') ||
      l.toLowerCase().includes('materiales') ||
      l.toLowerCase().includes('información confidencial') ||
      l.toLowerCase().includes('informacion confidencial') ||
      r.toLowerCase().includes('maquinaria') ||
      r.toLowerCase().includes('informes y registros')
    );

    if (isCheckItem) {
      checkRows.push({ left: l, right: r });
      continue;
    }

    // Flush pending check rows
    if (checkRows.length > 0) {
      html += checkRows.map(cr => `
        <tr>
          <td class="resp-check-left">${nl2br(cr.left)}</td>
          <td class="resp-check-right">${nl2br(cr.right)}</td>
        </tr>
      `).join('');
      checkRows.length = 0;
    }

    const isHeaderL = l && l.length < 80 && !/[.,;]$/.test(l) && !l.includes('•') && !l.includes('\u2022') && !l.toLowerCase().includes('procurar') && !l.toLowerCase().includes('conocer');
    const isHeaderR = r && r.length < 80 && !/[.,;]$/.test(r) && !r.includes('•') && !r.includes('\u2022') && !r.toLowerCase().includes('procurar') && !r.toLowerCase().includes('conocer');

    if (isHeaderL && isHeaderR) {
      html += `
        <tr>
          <th class="subsec-title" style="width: 50%;">${l}</th>
          <th class="subsec-title" style="width: 50%;">${r}</th>
        </tr>
      `;
    } else if (isHeaderL && !r) {
      html += `
        <tr>
          <th class="subsec-title" colspan="2">${l}</th>
        </tr>
      `;
    } else if (!l && isHeaderR) {
      html += `
        <tr>
          <th class="subsec-title" colspan="2">${r}</th>
        </tr>
      `;
    } else {
      html += `
        <tr>
          <td class="val-top" style="width: 50%;">${formatBulletText(l)}</td>
          <td class="val-top" style="width: 50%;">${formatBulletText(r)}</td>
        </tr>
      `;
    }
  }

  if (checkRows.length > 0) {
    html += checkRows.map(cr => `
      <tr>
        <td class="resp-check-left">${nl2br(cr.left)}</td>
        <td class="resp-check-right">${nl2br(cr.right)}</td>
      </tr>
    `).join('');
  }

  return html;
}

function buildHtml(c: PerfilCargoContenido, version: number, logoSrc: string, firma?: FirmaData): string {
  const isCritical = (c.cargo_critico || '').toLowerCase().includes('si') || (c.cargo_critico || '').toLowerCase().includes('x');

  // Flujograma grouping / rendering
  const flujogramaHtml = c.flujograma.map((f, i) => {
    const procesoPart = f.proceso ? `<div class="fj-proc-title">${f.proceso}</div>` : '';
    const funcionPart = f.funcion ? `<div class="fj-func-title">${f.funcion}</div>` : '';
    const leftContent = `${procesoPart}${funcionPart}` || '—';
    return `
      <tr>
        <td class="fj-col-left">${leftContent}</td>
        <td class="fj-col-right">${f.actividad || '—'}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Perfil y Funciones del Cargo - FO-SG-008</title>
<style>
  @page {
    size: letter;
    margin: 10mm 10mm 10mm 10mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    font-size: 8.5pt;
    line-height: 1.25;
    color: #000000;
    background: #ffffff;
    padding: 0;
  }

  /* ── Tablas Principales Formato Excel ── */
  table.excel-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000000;
    margin-bottom: 0px;
    page-break-inside: auto;
  }

  table.excel-table th,
  table.excel-table td {
    border: 1px solid #000000;
    padding: 3px 6px;
    font-size: 8pt;
    color: #000000;
    vertical-align: middle;
  }

  /* ── Encabezado Institucional ── */
  .hdr-logo-cell {
    width: 20%;
    text-align: center;
    vertical-align: middle;
    padding: 3px 6px;
    background: #ffffff;
  }
  .hdr-logo-img {
    max-height: 48px;
    max-width: 125px;
    width: auto;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
  .hdr-title-cell {
    width: 56%;
    text-align: center;
    vertical-align: middle;
    padding: 4px 6px;
  }
  .hdr-sig {
    font-size: 8.5pt;
    font-weight: 900 !important;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    color: #000000;
  }
  .hdr-docname {
    font-size: 10.5pt;
    font-weight: 900 !important;
    text-transform: uppercase;
    margin-top: 3px;
    letter-spacing: 0.02em;
    color: #000000;
  }
  .hdr-meta-cell {
    width: 24%;
    text-align: left;
    font-size: 8pt;
    line-height: 1.45;
    padding: 4px 8px;
    vertical-align: middle;
    font-weight: 900 !important;
    color: #000000;
  }
  .hdr-meta-line {
    font-size: 8pt;
    font-weight: 900 !important;
    color: #000000;
  }

  /* ── Celdas de Datos y Etiquetas ── */
  .lbl {
    background-color: #f2f2f2;
    font-weight: 800 !important;
    font-size: 8pt;
    color: #000000;
  }
  .val {
    background-color: #ffffff;
    font-size: 8pt;
    color: #000000;
  }
  .val-bold {
    background-color: #ffffff;
    font-size: 8.5pt;
    font-weight: 800 !important;
    color: #000000;
  }
  .val-top {
    background-color: #ffffff;
    font-size: 8pt;
    vertical-align: top !important;
    padding: 4px 6px;
  }

  /* ── Encabezados de Secciones (Color Azul Excel #cfe2f3) ── */
  .sec-title {
    background-color: #cfe2f3 !important;
    font-size: 8.5pt !important;
    font-weight: 900 !important;
    text-align: center !important;
    text-transform: uppercase !important;
    padding: 4px 6px !important;
    letter-spacing: 0.02em;
    border: 1px solid #000000 !important;
    color: #000000 !important;
  }

  /* ── Sub-encabezados de Columnas (Color Gris #e2e8f0 / #f2f2f2) ── */
  .subsec-title {
    background-color: #f2f2f2 !important;
    font-size: 8pt !important;
    font-weight: 800 !important;
    text-align: center !important;
    padding: 3.5px 6px !important;
    border: 1px solid #000000 !important;
    color: #000000 !important;
  }

  /* ── Listas con Viñetas ── */
  ul.bullet-list {
    margin: 2px 0 2px 14px;
    padding: 0;
    list-style-type: disc;
  }
  ul.bullet-list li {
    margin-bottom: 2.5px;
    font-size: 7.8pt;
    line-height: 1.35;
    color: #000000;
    text-align: justify;
  }
  ul.bullet-list li:last-child {
    margin-bottom: 0;
  }

  /* ── Responsabilidad Grid ── */
  .resp-check-left, .resp-check-right {
    font-size: 8pt;
    font-weight: bold !important;
    background: #ffffff;
    padding: 4px 6px;
    border: 1px solid #000000;
    color: #000000;
  }

  /* ── Flujograma de Procesos ── */
  .fj-col-left {
    width: 32%;
    font-size: 8pt;
    vertical-align: top;
    background: #ffffff;
    padding: 4px 6px;
    border: 1px solid #000000;
  }
  .fj-col-right {
    width: 68%;
    font-size: 8pt;
    vertical-align: top;
    background: #ffffff;
    padding: 4px 6px;
    border: 1px solid #000000;
  }
  .fj-proc-title {
    font-weight: bold;
    margin-bottom: 2px;
    color: #000000;
  }
  .fj-func-title {
    font-weight: 600;
    color: #333333;
    font-size: 7.5pt;
  }

  /* ── Certificado de Aceptación y Firma ── */
  .cert-container {
    padding: 6px 8px;
    font-size: 8pt;
    line-height: 1.4;
    background: #ffffff;
  }
  .cert-text {
    font-size: 8pt;
    line-height: 1.35;
    margin-bottom: 8px;
    text-align: justify;
  }
  .firma-lines-box {
    margin-top: 8px;
    margin-bottom: 4px;
  }
  .firma-line-item {
    font-size: 8pt;
    margin-bottom: 6px;
    font-weight: 500;
  }

  /* ── Estampilla de Firma Digital ── */
  .firma-stamp-box {
    display: inline-block;
    border: 1px solid #000000;
    background: #fafafa;
    padding: 6px 12px;
    border-radius: 4px;
    margin-top: 4px;
    margin-bottom: 4px;
    text-align: left;
  }
  .firma-img {
    height: 48px;
    max-width: 220px;
    object-fit: contain;
    display: block;
    margin-bottom: 3px;
    border-bottom: 1px solid #000000;
    padding-bottom: 2px;
  }
  .firma-meta-detail {
    font-size: 7pt;
    color: #111827;
    line-height: 1.3;
  }

  .avoid-break {
    page-break-inside: avoid;
  }
</style>
</head>
<body>

  <!-- 1. Encabezado Institucional -->
  <table class="excel-table">
    <tr>
      <td class="hdr-logo-cell">
        ${logoSrc ? `<img src="${logoSrc}" class="hdr-logo-img" alt="Milla 7" />` : '<b>MILLA 7</b>'}
      </td>
      <td class="hdr-title-cell">
        <div class="hdr-sig"><b>${c.sistema_gestion || 'SISTEMA INTEGRADO DE GESTIÓN BASC - PESV - SGA - SG-SST'}</b></div>
        <div class="hdr-docname"><b>${c.titulo_documento || 'PERFIL Y FUNCIONES DEL CARGO'}</b></div>
      </td>
      <td class="hdr-meta-cell">
        <div class="hdr-meta-line"><b>CÓDIGO: ${c.codigo_formato || 'FO-SG-008'}</b></div>
        <div class="hdr-meta-line"><b>VERSIÓN: ${c.version_formato || version || 2}</b></div>
        <div class="hdr-meta-line"><b>FECHA: ${c.fecha_formato || '03/09/2025'}</b></div>
      </td>
    </tr>
  </table>

  <!-- 2. Información General del Cargo -->
  <table class="excel-table" style="border-top: none;">
    <tr>
      <td class="lbl" style="width: 22%;">Fecha de Actualización:</td>
      <td class="val" colspan="3">${c.fecha_actualizacion || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">Nombre del Cargo:</td>
      <td class="val-bold uppercase" colspan="3">${(c.cargo || '—').toUpperCase()}</td>
    </tr>
    <tr>
      <td class="lbl">Dependencia:</td>
      <td class="val uppercase" colspan="3">${(c.dependencia || '—').toUpperCase()}</td>
    </tr>
    <tr>
      <td class="lbl">Jefe Inmediato:</td>
      <td class="val uppercase" colspan="3">${(c.jefe_inmediato || '—').toUpperCase()}</td>
    </tr>
    <tr>
      <td class="lbl">Cargo crítico</td>
      <td class="val" style="width: 38%;">
        SI: ${isCritical ? '<b>X</b>' : ''}
      </td>
      <td class="lbl" style="width: 10%; text-align: center;">NO:</td>
      <td class="val" style="width: 30%;">
        ${!isCritical ? '<b>X</b>' : ''}
      </td>
    </tr>
  </table>

  <!-- 3. I. Organigrama -->
  <table class="excel-table" style="border-top: none;">
    <tr>
      <th class="sec-title" colspan="2">I. ORGANIGRAMA</th>
    </tr>
    <tr>
      <td class="lbl" style="width: 22%;">Personas a Cargo:</td>
      <td class="val">${c.personas_a_cargo || 'SI'}</td>
    </tr>
    <tr>
      <td class="lbl">Condiciones de Salario:</td>
      <td class="val">${formatCurrencyCOP(c.condiciones_salario)}</td>
    </tr>
    <tr>
      <td class="lbl">Propósito del cargo</td>
      <td class="val">${nl2br(c.proposito_cargo || '—')}</td>
    </tr>
    <tr>
      <td class="lbl">Porque responde</td>
      <td class="val">${nl2br(c.porque_responde || 'Ver manual de funciones')}</td>
    </tr>
  </table>

  <!-- 4. II. Competencias -->
  <table class="excel-table" style="border-top: none;">
    <tr>
      <th class="sec-title" colspan="2">II. COMPETENCIAS</th>
    </tr>
    <tr>
      <th class="subsec-title" style="width: 50%;">Formación académica</th>
      <th class="subsec-title" style="width: 50%;">Experiencia</th>
    </tr>
    <tr>
      <td class="val-top">${formatBulletText(c.competencias.formacion_academica)}</td>
      <td class="val-top">${formatBulletText(c.competencias.experiencia)}</td>
    </tr>
    <tr>
      <th class="subsec-title">Conocimientos específicos</th>
      <th class="subsec-title">Competencias organizacionales</th>
    </tr>
    <tr>
      <td class="val-top">${formatBulletText(c.competencias.conocimientos_especificos)}</td>
      <td class="val-top">${formatBulletText(c.competencias.competencias_organizacionales)}</td>
    </tr>
  </table>

  <!-- 5. III. Comunicaciones -->
  <table class="excel-table avoid-break" style="border-top: none;">
    <tr>
      <th class="sec-title" colspan="2">III. COMUNICACIONES</th>
    </tr>
    <tr>
      <th class="subsec-title" style="width: 50%;">Internas</th>
      <th class="subsec-title" style="width: 50%;">Externas</th>
    </tr>
    <tr>
      <td class="val-top">${formatBulletText(c.comunicaciones.internas)}</td>
      <td class="val-top">${formatBulletText(c.comunicaciones.externas)}</td>
    </tr>
  </table>

  <!-- 6. IV. Responsabilidad con -->
  <table class="excel-table" style="border-top: none;">
    <tr>
      <th class="sec-title" colspan="2">IV. RESPONSABILIDAD CON</th>
    </tr>
    ${renderResponsabilidadRows(c.responsabilidad_con)}
  </table>

  <!-- 7. V. Flujograma de Procesos -->
  <table class="excel-table" style="border-top: none;">
    <tr>
      <th class="sec-title" colspan="2">V. FLUJOGRAMA DE PROCESOS</th>
    </tr>
    <tr>
      <th class="subsec-title uppercase" colspan="2">${c.cargo || 'CARGO'}</th>
    </tr>
    <tr>
      <th class="subsec-title" style="width: 32%;">Proceso (Funciones)</th>
      <th class="subsec-title" style="width: 68%;">Ruta crítica (Actividades críticas)</th>
    </tr>
    ${flujogramaHtml || '<tr><td colspan="2" class="val" style="text-align:center;">Ver manual de funciones institucional</td></tr>'}
  </table>

  <!-- 8. Certificado de Aceptación y Recibido + Firma -->
  <table class="excel-table avoid-break" style="border-top: none;">
    <tr>
      <th class="sec-title" style="text-align: left !important; padding-left: 8px !important;">CERTIFICADO DE ACEPTACIÓN Y RECIBIDO</th>
    </tr>
    <tr>
      <td class="cert-container">
        <p class="cert-text">
          Yo <u>${firma ? `<b>${firma.nombre}</b>` : '____________________________________________________'}</u> en mi calidad titular del cargo de <u><b>${(c.cargo || '').toLowerCase()}</b></u>, acepto las funciones descritas en el manual de funciones entregado, así mismo las revisaré de manera permanente y colaboraré con la empresa aportando nuevas ideas que ayuden al desempeño de mi cargo.
        </p>

        ${firma ? `
          <div class="firma-stamp-box">
            <img class="firma-img" src="${firma.firma_b64}" alt="Firma Digital" />
            <div class="firma-meta-detail">
              <b>Firma Digital:</b> ${firma.nombre}<br/>
              <b>Cédula:</b> ${firma.cedula}<br/>
              <b>Fecha y Hora:</b> ${fmtFecha(firma.firmado_at)}<br/>
              ${firma.ip ? `<b>IP Auditoría:</b> ${firma.ip}<br/>` : ''}
              <b>Estado:</b> ACEPTADO Y FIRMADO ELECTRÓNICAMENTE
            </div>
          </div>
        ` : `
          <div class="firma-lines-box">
            <div class="firma-line-item">Firma ________________________________________________</div>
            <div class="firma-line-item">Cedula ________________________________________________</div>
          </div>
        `}
      </td>
    </tr>
  </table>

  <!-- 9. Bloque de Elaboración y Aprobación -->
  <table class="excel-table avoid-break" style="border-top: none;">
    <tr>
      <td class="lbl" style="width: 22%;">Elaborado por:</td>
      <td class="val">${c.elaborado_por || 'Gestión Humana'}</td>
    </tr>
    <tr>
      <td class="lbl">Aprobado por:</td>
      <td class="val">${c.aprobado_por || 'Gerencia'}</td>
    </tr>
  </table>

</body>
</html>`;
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '8mm',
        bottom: '8mm',
        left: '8mm',
        right: '8mm'
      }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generatePerfilCargoPdf(contenido: PerfilCargoContenido, version: number): Promise<Buffer> {
  return renderPdf(buildHtml(contenido, version, getLogoBase64()));
}

export async function generatePerfilCargoFirmadoPdf(contenido: PerfilCargoContenido, version: number, firma: FirmaData): Promise<Buffer> {
  return renderPdf(buildHtml(contenido, version, getLogoBase64(), firma));
}
