import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerfilCargoContenido } from './gh-perfiles-cargo-parser.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-encuesta.png');

export interface FirmaData {
  nombre: string;
  cedula: string;
  firma_b64: string;
  firmado_at: string | Date;
  ip?: string;
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
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return String(d || ''); }
}

const nl2br = (s: string) => (s || '').replace(/\n/g, '<br/>');

function buildHtml(c: PerfilCargoContenido, version: number, logoSrc: string, firma?: FirmaData): string {
  const responsabilidadHtml = c.responsabilidad_con.map(({ left, right }) => {
    const isHeaderL = left && left.length < 70 && !/[.,]$/.test(left);
    const isHeaderR = right && right.length < 70 && !/[.,]$/.test(right);
    return `<div class="resp-row">
      <div class="${isHeaderL ? 'resp-head' : 'resp-body'}">${nl2br(left)}</div>
      <div class="${isHeaderR ? 'resp-head' : 'resp-body'}">${nl2br(right)}</div>
    </div>`;
  }).join('');

  const flujogramaRows = c.flujograma.map(f => `
    <tr>
      <td class="fj-proceso">${f.proceso}</td>
      <td class="fj-funcion">${f.funcion}</td>
      <td class="fj-actividad">${f.actividad}</td>
    </tr>`).join('');

  const certificado = firma
    ? `<div class="cert-firmado">
        <p>Yo <b>${firma.nombre}</b>, identificado(a) con cédula <b>${firma.cedula}</b>, en mi calidad de titular del cargo de <b>${c.cargo}</b>, acepto las funciones descritas en el presente manual, así mismo las revisaré de manera permanente y colaboraré con la empresa aportando nuevas ideas que ayuden al desempeño de mi cargo.</p>
        <div class="firma-line">
          <div class="firma-box">
            <img class="firma-img" src="${firma.firma_b64}" alt="firma" />
            <div class="firma-caption">${firma.nombre}<br/>C.C. ${firma.cedula}</div>
          </div>
          <div class="firma-meta">
            Firmado electrónicamente el ${fmtFecha(firma.firmado_at)}${firma.ip ? `<br/>IP: ${firma.ip}` : ''}<br/>
            Documento versión ${version}
          </div>
        </div>
      </div>`
    : `<div class="cert-pendiente">
        <p>Yo _________________________________________, identificado(a) con cédula ______________________, en mi calidad de titular del cargo de <b>${c.cargo}</b>, acepto las funciones descritas en el presente manual, así mismo las revisaré de manera permanente y colaboraré con la empresa aportando nuevas ideas que ayuden al desempeño de mi cargo.</p>
        <div class="firma-line">
          <div class="firma-box-vacia">Firma: _____________________________</div>
          <div class="firma-box-vacia">Fecha: _____________________________</div>
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9.5px; color: #1a2a2a; background: #fff; padding: 20px 24px; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0d3b3b; padding-bottom: 10px; margin-bottom: 12px; }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .logo { height: 40px; object-fit: contain; }
  .header-title h1 { font-size: 13px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; letter-spacing: 0.02em; }
  .header-title p { font-size: 7.5px; color: #5a8080; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
  .header-right { text-align: right; font-size: 7.5px; color: #5a8080; line-height: 1.6; }
  .header-right b { color: #0d3b3b; }

  h2.cargo-title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; text-align: center; margin: 6px 0 12px; }

  .meta { background: #f0f7f7; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; display: flex; gap: 18px; flex-wrap: wrap; }
  .meta-item span { display: block; font-size: 6.5px; font-weight: 900; text-transform: uppercase; color: #80a0a0; letter-spacing: 0.06em; }
  .meta-item strong { font-size: 8.5px; color: #0d3b3b; font-weight: 700; }

  h3.section { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #fff; background: #0d3b3b; letter-spacing: 0.05em; margin: 12px 0 6px; padding: 4px 8px; border-radius: 3px; }

  .field { margin-bottom: 6px; }
  .field span { display: block; font-size: 6.5px; font-weight: 900; text-transform: uppercase; color: #80a0a0; letter-spacing: 0.05em; }
  .field p { font-size: 8.5px; color: #1a2a2a; }

  .two-col { display: flex; gap: 12px; }
  .two-col > div { flex: 1; }
  .two-col h4 { font-size: 7px; font-weight: 900; text-transform: uppercase; color: #0d3b3b; margin-bottom: 3px; border-bottom: 1px solid #d6e6e6; padding-bottom: 2px; }
  .two-col p { font-size: 8px; line-height: 1.45; white-space: pre-line; }

  .resp-row { display: flex; gap: 12px; margin-bottom: 3px; }
  .resp-row > div { flex: 1; font-size: 8px; line-height: 1.4; }
  .resp-head { font-weight: 900; color: #0d3b3b; text-transform: uppercase; font-size: 7px; margin-top: 4px; }
  .resp-body { color: #1a2a2a; }

  table.flujo { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.flujo th { background: #0d3b3b; color: #fff; font-size: 6.5px; text-transform: uppercase; padding: 4px 6px; text-align: left; }
  table.flujo td { font-size: 7.5px; padding: 3px 6px; border-bottom: 1px solid #e8f0f0; vertical-align: top; }
  .fj-proceso { font-weight: 700; color: #0d3b3b; width: 18%; }
  .fj-funcion { width: 27%; }

  .cert-pendiente, .cert-firmado { margin-top: 16px; border: 1px solid #d6e6e6; border-radius: 6px; padding: 12px 14px; page-break-inside: avoid; }
  .cert-pendiente p, .cert-firmado p { font-size: 8.5px; line-height: 1.5; margin-bottom: 8px; }
  .firma-line { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; gap: 16px; }
  .firma-box-vacia { flex: 1; font-size: 8px; border-top: 1px solid #0d3b3b; padding-top: 4px; }
  .firma-box { text-align: center; }
  .firma-img { height: 46px; object-fit: contain; border-bottom: 1px solid #0d3b3b; padding-bottom: 2px; }
  .firma-caption { font-size: 7px; color: #5a8080; margin-top: 2px; }
  .firma-meta { font-size: 7px; color: #80a0a0; text-align: right; }

  .footer { margin-top: 16px; text-align: center; font-size: 6.5px; color: #80a0a0; border-top: 1px solid #e8f0f0; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo" />` : ''}
      <div class="header-title">
        <h1>Perfil y Funciones del Cargo</h1>
        <p>Milla 7 S.A.S. — Sistema Integrado de Gestión BASC · PESV · SGA · SG-SST</p>
      </div>
    </div>
    <div class="header-right">
      CÓDIGO: <b>FO-SG-008</b><br/>
      VERSIÓN DEL PERFIL: <b>${version}</b><br/>
      ACTUALIZADO: <b>${c.fecha_actualizacion || '—'}</b>
    </div>
  </div>

  <h2 class="cargo-title">${c.cargo}</h2>

  <div class="meta">
    <div class="meta-item"><span>Dependencia</span><strong>${c.dependencia || '—'}</strong></div>
    <div class="meta-item"><span>Jefe inmediato</span><strong>${c.jefe_inmediato || '—'}</strong></div>
    <div class="meta-item"><span>Cargo crítico</span><strong>${c.cargo_critico || '—'}</strong></div>
    <div class="meta-item"><span>Personas a cargo</span><strong>${c.personas_a_cargo || '—'}</strong></div>
  </div>

  <div class="field"><span>Propósito del cargo</span><p>${nl2br(c.proposito_cargo)}</p></div>

  <h3 class="section">II. Competencias</h3>
  <div class="two-col">
    <div><h4>Formación académica</h4><p>${nl2br(c.competencias.formacion_academica)}</p></div>
    <div><h4>Experiencia</h4><p>${nl2br(c.competencias.experiencia)}</p></div>
  </div>
  <div class="two-col" style="margin-top:6px;">
    <div><h4>Conocimientos específicos</h4><p>${nl2br(c.competencias.conocimientos_especificos)}</p></div>
    <div><h4>Competencias organizacionales</h4><p>${nl2br(c.competencias.competencias_organizacionales)}</p></div>
  </div>

  <h3 class="section">III. Comunicaciones</h3>
  <div class="two-col">
    <div><h4>Internas</h4><p>${nl2br(c.comunicaciones.internas)}</p></div>
    <div><h4>Externas</h4><p>${nl2br(c.comunicaciones.externas)}</p></div>
  </div>

  <h3 class="section">IV. Responsabilidad con</h3>
  ${responsabilidadHtml}

  <h3 class="section">V. Flujograma de procesos</h3>
  <table class="flujo">
    <tr><th>Proceso</th><th>Función</th><th>Actividad crítica</th></tr>
    ${flujogramaRows}
  </table>

  <h3 class="section">Certificado de Aceptación y Recibido</h3>
  ${certificado}

  <div class="footer">
    OrbitM7 — Plataforma de Gestión Logística · Milla 7 S.A.S. · Elaborado por: ${c.elaborado_por || 'Gestión Humana'} · Aprobado por: ${c.aprobado_por || 'Gerencia'}
  </div>
</body>
</html>`;
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
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
