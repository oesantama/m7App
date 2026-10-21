import puppeteer from 'puppeteer';
import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-encuesta.png');

function getLogoBase64(): string {
  try { return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`; }
  catch { return ''; }
}

interface CierreRow {
  planilla: string;
  placa: string;
  fecha: string;
  client_id: string;
  dias_abierto: number;
  total_facturas: number;
  pendientes: number;
  sobrantes: number;
  cerradas: number;
}

interface ResumenCliente {
  cliente: string;
  planillas: number;
  pendientes: number;
  sobrantes: number;
  mas15: number;
  mas30: number;
  max_dias: number;
}

export interface CierreFactReport {
  base64: string;                 // PDF con el detalle (máx. 80 planillas más antiguas)
  fileName: string;
  caption: string;
  dashboardPngBase64: string;     // dash informativo (imagen para WhatsApp)
  dashboardFileName: string;
  dashboardHtml: string;          // dash informativo en HTML con estilos en línea (cuerpo del correo)
  totalPlanillas: number;         // planillas con facturas pendientes (todas, no solo las del PDF)
}

const fmt = (n: number) => Number(n || 0).toLocaleString('es-CO');
const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Dash informativo con el panorama general (KPIs + desglose por cliente/bodega). Usa solo
 * estilos en línea y tablas para verse igual en clientes de correo y al renderizarlo como imagen.
 */
function buildDashboardHtml(fecha: string, alcance: string, t: ResumenCliente, porCliente: ResumenCliente[]): string {
  const card = (valor: string, label: string, color: string) => `
    <td style="width:16.6%;padding:4px;vertical-align:top;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 8px;text-align:center;height:58px;">
        <div style="font-size:24px;font-weight:900;color:${color};font-family:Arial,sans-serif;">${valor}</div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;font-family:Arial,sans-serif;">${label}</div>
      </div>
    </td>`;
  const maxPend = Math.max(1, ...porCliente.map(c => Number(c.pendientes)));
  const filas = porCliente.map(c => {
    const color = c.max_dias >= 30 ? '#dc2626' : c.max_dias >= 15 ? '#d97706' : '#059669';
    const ancho = Math.round((Number(c.pendientes) / maxPend) * 100);
    return `
      <tr>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${esc(c.cliente)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${fmt(c.planillas)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:800;color:#dc2626;">${fmt(c.pendientes)}</div>
          <div style="background:#fee2e2;border-radius:4px;height:5px;margin-top:3px;"><div style="background:#dc2626;border-radius:4px;height:5px;width:${ancho}%;"></div></div>
        </td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#d97706;">${fmt(c.sobrantes)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${fmt(c.mas15)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:${color};">${fmt(c.max_dias)} d</td>
      </tr>`;
  }).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#1e293b;background:#ffffff;">
    <div style="background:#0f172a;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;">
      <div style="font-size:17px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;">Cierre de Facturación — Resumen general</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;">${esc(fecha)} · ${esc(alcance)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:14px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
        ${card(fmt(t.planillas), 'Planillas abiertas', '#0f172a')}
        ${card(fmt(t.pendientes), 'Facturas pendientes', '#dc2626')}
        ${card(fmt(t.sobrantes), 'Sobrantes', '#d97706')}
        ${card(fmt(t.mas15), '+15 días', '#d97706')}
        ${card(fmt(t.mas30), '+30 días', '#dc2626')}
        ${card(`${fmt(t.max_dias)} d`, 'Más antigua', '#0f172a')}
      </tr></table>
      ${porCliente.length ? `
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0f172a;margin:14px 4px 6px;">Por cliente / bodega</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#f1f5f9;color:#475569;text-transform:uppercase;font-size:9px;">
          <th style="padding:7px 8px;text-align:left;">Cliente</th>
          <th style="padding:7px 8px;">Planillas</th>
          <th style="padding:7px 8px;text-align:left;">Facturas pendientes</th>
          <th style="padding:7px 8px;">Sobrantes</th>
          <th style="padding:7px 8px;">+15 días</th>
          <th style="padding:7px 8px;">Más antigua</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>` : `<p style="margin:14px 4px;color:#059669;font-weight:700;">✅ Sin planillas pendientes de cierre.</p>`}
      <p style="font-size:9px;color:#94a3b8;margin:12px 4px 0;">El detalle por planilla (las 80 más antiguas) está en el PDF adjunto. OrbitM7 · Milla 7 S.A.S.</p>
    </div>
  </div>`;
}

export async function generateCierreFactReport(clientId?: string): Promise<CierreFactReport> {
  const params: string[] = [];
  let clientFilter = '';
  if (clientId) {
    const clientIds = clientId.split(',').map(id => id.trim()).filter(Boolean);
    if (clientIds.length > 0) {
      const placeholders = clientIds.map((_, i) => `$${params.push(clientIds[i])}`).join(', ');
      clientFilter = `AND dl.client_id IN (${placeholders})`;
    }
  }

  const result = await pool.query<CierreRow>(`
    SELECT
      dl.external_doc_id                                    AS planilla,
      dl.vehicle_plate                                      AS placa,
      dl.delivery_date::date::text                          AS fecha,
      dl.client_id,
      EXTRACT(DAY FROM NOW() - dl.delivery_date)::int       AS dias_abierto,
      COUNT(di.id)                                          AS total_facturas,
      COUNT(CASE WHEN di.item_status IS NULL
                   OR di.item_status NOT IN
                     ('EST-11','EST-12','EST-13','EST-14','EST-15','EST-16','EST-17')
                 THEN 1 END)                                AS pendientes,
      COUNT(CASE WHEN di.item_status IN ('EST-16','EST-17') THEN 1 END) AS sobrantes,
      COUNT(CASE WHEN di.item_status IN ('EST-11','EST-12','EST-13','EST-14','EST-15')
                 THEN 1 END)                                AS cerradas
    FROM documents_l dl
    JOIN document_items di ON di.document_id = dl.id
    WHERE 1=1 ${clientFilter}
    GROUP BY dl.id
    HAVING COUNT(CASE WHEN di.item_status IS NULL
                        OR di.item_status NOT IN
                          ('EST-11','EST-12','EST-13','EST-14','EST-15','EST-16','EST-17')
                      THEN 1 END) > 0
    ORDER BY dl.delivery_date ASC
    LIMIT 80
  `, params);

  const rows = result.rows;
  const now = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Resumen general sobre TODAS las planillas pendientes (el PDF lista solo las 80 más antiguas)
  const resumenRes = await pool.query<ResumenCliente>(`
    WITH pend AS (
      SELECT dl.id, dl.client_id,
             EXTRACT(DAY FROM NOW() - dl.delivery_date)::int AS dias,
             COUNT(CASE WHEN di.item_status IS NULL
                          OR di.item_status NOT IN ('EST-11','EST-12','EST-13','EST-14','EST-15','EST-16','EST-17')
                        THEN 1 END) AS pendientes,
             COUNT(CASE WHEN di.item_status IN ('EST-16','EST-17') THEN 1 END) AS sobrantes
      FROM documents_l dl
      JOIN document_items di ON di.document_id = dl.id
      WHERE 1=1 ${clientFilter}
      GROUP BY dl.id
      HAVING COUNT(CASE WHEN di.item_status IS NULL
                          OR di.item_status NOT IN ('EST-11','EST-12','EST-13','EST-14','EST-15','EST-16','EST-17')
                        THEN 1 END) > 0
    )
    SELECT COALESCE(c.name, p.client_id, 'SIN CLIENTE') AS cliente,
           COUNT(*)::int AS planillas,
           SUM(p.pendientes)::int AS pendientes,
           SUM(p.sobrantes)::int AS sobrantes,
           COUNT(*) FILTER (WHERE p.dias >= 15)::int AS mas15,
           COUNT(*) FILTER (WHERE p.dias >= 30)::int AS mas30,
           COALESCE(MAX(p.dias), 0)::int AS max_dias
    FROM pend p LEFT JOIN clients c ON c.id = p.client_id
    GROUP BY 1 ORDER BY pendientes DESC
  `, params);
  const porCliente = resumenRes.rows;
  const total: ResumenCliente = porCliente.reduce((t, c) => ({
    cliente: 'TOTAL',
    planillas: t.planillas + Number(c.planillas),
    pendientes: t.pendientes + Number(c.pendientes),
    sobrantes: t.sobrantes + Number(c.sobrantes),
    mas15: t.mas15 + Number(c.mas15),
    mas30: t.mas30 + Number(c.mas30),
    max_dias: Math.max(t.max_dias, Number(c.max_dias)),
  }), { cliente: 'TOTAL', planillas: 0, pendientes: 0, sobrantes: 0, mas15: 0, mas30: 0, max_dias: 0 });
  let alcanceTxt = 'Todos los clientes';
  if (params.length) {
    const nombres = await pool.query(`SELECT name FROM clients WHERE id = ANY($1) ORDER BY name`, [params]);
    alcanceTxt = nombres.rows.map(r => r.name).join(', ') || params.join(', ');
  }
  const dashboardHtml = buildDashboardHtml(now, alcanceTxt, total, porCliente);
  const logo = getLogoBase64();

  const tableRows = rows.map(r => {
    const diasColor = r.dias_abierto >= 30 ? '#dc2626'
                    : r.dias_abierto >= 15 ? '#d97706'
                    : '#059669';
    return `
      <tr>
        <td style="font-weight:700;font-family:monospace">${r.planilla || '—'}</td>
        <td>${r.placa || '—'}</td>
        <td>${r.fecha || '—'}</td>
        <td style="text-align:center;color:${diasColor};font-weight:800">${r.dias_abierto}</td>
        <td style="text-align:center">${r.total_facturas}</td>
        <td style="text-align:center;color:#dc2626;font-weight:700">${r.pendientes}</td>
        <td style="text-align:center;color:#d97706;font-weight:700">${r.sobrantes}</td>
        <td style="text-align:center;color:#059669">${r.cerradas}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 24px; }
  .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; padding-bottom:12px; border-bottom:3px solid #0f172a; }
  .logo { height:48px; object-fit:contain; }
  .title-block h1 { font-size:16px; font-weight:900; text-transform:uppercase; color:#0f172a; }
  .title-block p { font-size:10px; color:#64748b; margin-top:2px; }
  .badge { display:inline-block; padding:3px 10px; border-radius:9999px; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .badge-warn { background:#fef3c7; color:#92400e; }
  .summary { display:flex; gap:12px; margin-bottom:16px; }
  .summary-card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; }
  .summary-card .val { font-size:22px; font-weight:900; color:#0f172a; }
  .summary-card .lbl { font-size:9px; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  thead th { background:#0f172a; color:#fff; padding:7px 8px; text-align:left; font-weight:800; text-transform:uppercase; letter-spacing:.5px; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  tbody tr:hover { background:#eff6ff; }
  tbody td { padding:6px 8px; border-bottom:1px solid #e2e8f0; }
  .legend { margin-top:14px; display:flex; gap:16px; font-size:9px; color:#64748b; }
  .legend span { display:inline-flex; align-items:center; gap:4px; }
  .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
  .footer { margin-top:16px; text-align:right; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="header">
  ${logo ? `<img src="${logo}" class="logo" />` : '<div style="font-weight:900;font-size:18px;color:#059669">M7</div>'}
  <div class="title-block">
    <h1>Cierre de Facturación</h1>
    <p>Documentos L con facturas pendientes · ${now}</p>
  </div>
  <span class="badge badge-warn">⚠ ${fmt(total.planillas)} planilla${total.planillas !== 1 ? 's' : ''} pendiente${total.planillas !== 1 ? 's' : ''}${total.planillas > rows.length ? ` · se listan las ${rows.length} más antiguas` : ''}</span>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="val">${fmt(total.planillas)}</div>
    <div class="lbl">Planillas abiertas</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${fmt(total.pendientes)}</div>
    <div class="lbl">Facturas pendientes</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#d97706">${fmt(total.sobrantes)}</div>
    <div class="lbl">Sobrantes</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${fmt(total.mas15)}</div>
    <div class="lbl">+15 días abiertos</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Planilla</th>
      <th>Placa</th>
      <th>Fecha</th>
      <th style="text-align:center">Días abierto</th>
      <th style="text-align:center">Total fact.</th>
      <th style="text-align:center">Pendientes</th>
      <th style="text-align:center">Sobrantes</th>
      <th style="text-align:center">Cerradas</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>

<div class="legend">
  <span><span class="dot" style="background:#059669"></span> &lt;15 días</span>
  <span><span class="dot" style="background:#d97706"></span> 15–29 días</span>
  <span><span class="dot" style="background:#dc2626"></span> ≥30 días — acción urgente</span>
</div>

<div class="footer">OrbitM7 · Milla 7 S.A.S. · Generado ${now}</div>
</body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' } });
    const base64 = Buffer.from(pdfBuffer).toString('base64');
    const fileName = `CierreFacturacion_${now.replace(/\//g, '-')}.pdf`;
    const caption = `📋 *Cierre de Facturación — ${now}*\n${fmt(total.planillas)} planilla(s) pendiente(s)\n${fmt(total.pendientes)} facturas sin cerrar`;

    // Dash informativo como imagen (para WhatsApp)
    const dash = await browser.newPage();
    await dash.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
    await dash.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#fff;">${dashboardHtml}</body></html>`, { waitUntil: 'load' });
    // Captura solo el dash (sin el alto sobrante de la página)
    const dashEl = await dash.$('body > div');
    const png = dashEl ? await dashEl.screenshot({ type: 'png' }) : await dash.screenshot({ type: 'png', fullPage: true });
    const dashboardPngBase64 = Buffer.from(png).toString('base64');
    const dashboardFileName = `CierreFacturacion_Resumen_${now.replace(/\//g, '-')}.png`;

    return { base64, fileName, caption, dashboardPngBase64, dashboardFileName, dashboardHtml, totalPlanillas: total.planillas };
  } finally {
    await browser.close();
  }
}
