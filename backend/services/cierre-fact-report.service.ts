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

export async function generateCierreFactReport(clientId?: string): Promise<{
  base64: string; fileName: string; caption: string;
}> {
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
  <span class="badge badge-warn">⚠ ${rows.length} planilla${rows.length !== 1 ? 's' : ''} pendiente${rows.length !== 1 ? 's' : ''}</span>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="val">${rows.length}</div>
    <div class="lbl">Planillas abiertas</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${rows.reduce((s, r) => s + Number(r.pendientes), 0)}</div>
    <div class="lbl">Facturas pendientes</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#d97706">${rows.reduce((s, r) => s + Number(r.sobrantes), 0)}</div>
    <div class="lbl">Sobrantes</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${rows.filter(r => r.dias_abierto >= 15).length}</div>
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
    const caption = `📋 *Cierre de Facturación — ${now}*\n${rows.length} planilla(s) pendiente(s)\n${rows.reduce((s, r) => s + Number(r.pendientes), 0)} facturas sin cerrar`;
    return { base64, fileName, caption };
  } finally {
    await browser.close();
  }
}
