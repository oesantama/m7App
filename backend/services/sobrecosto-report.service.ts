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

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

interface SobrecostoRow {
  planilla: string;
  placa: string;
  fecha: string;
  client_id: string;
  dias_abierto: number;
  total_sobrecostos: number;
  valor_total: number;
  referencia: string | null;
}

export async function generateSobrecostoReport(clientId?: string): Promise<{
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

  const result = await pool.query<SobrecostoRow>(`
    SELECT
      dl.external_doc_id                                    AS planilla,
      dl.vehicle_plate                                      AS placa,
      dl.delivery_date::date::text                          AS fecha,
      dl.client_id,
      EXTRACT(DAY FROM NOW() - dl.delivery_date)::int       AS dias_abierto,
      COUNT(rs.id)                                          AS total_sobrecostos,
      SUM(rs.valor::numeric)                                AS valor_total,
      STRING_AGG(DISTINCT rs.referencia, ', ' ORDER BY rs.referencia) AS referencia
    FROM route_surcharges rs
    JOIN documents_l dl ON dl.id = rs.document_id
    WHERE rs.status_id = 'EST-01'
    ${clientFilter}
    GROUP BY dl.id
    ORDER BY valor_total DESC, dl.delivery_date ASC
    LIMIT 80
  `, params);

  const rows = result.rows;
  const now = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const logo = getLogoBase64();
  const totalValor = rows.reduce((s, r) => s + Number(r.valor_total || 0), 0);

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
        <td style="text-align:center;font-weight:700">${r.total_sobrecostos}</td>
        <td style="text-align:right;font-weight:800;color:#0f172a">${fmt(Number(r.valor_total || 0))}</td>
        <td style="font-size:9px;color:#64748b">${(r.referencia || '—').slice(0, 40)}</td>
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
  .badge { display:inline-block; padding:3px 10px; border-radius:9999px; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; background:#fee2e2; color:#991b1b; }
  .summary { display:flex; gap:12px; margin-bottom:16px; }
  .summary-card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; }
  .summary-card .val { font-size:20px; font-weight:900; color:#0f172a; }
  .summary-card .lbl { font-size:9px; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  thead th { background:#0f172a; color:#fff; padding:7px 8px; text-align:left; font-weight:800; text-transform:uppercase; letter-spacing:.5px; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  tbody td { padding:6px 8px; border-bottom:1px solid #e2e8f0; }
  tfoot td { padding:8px; font-weight:900; background:#fef3c7; border-top:2px solid #f59e0b; }
  .footer { margin-top:16px; text-align:right; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="header">
  ${logo ? `<img src="${logo}" class="logo" />` : '<div style="font-weight:900;font-size:18px;color:#059669">M7</div>'}
  <div class="title-block">
    <h1>Sobrecostos Pendientes de Aprobación</h1>
    <p>Documentos con sobrecostos en estado EST-01 · ${now}</p>
  </div>
  <span class="badge">🔴 ${rows.length} doc${rows.length !== 1 ? 's' : ''} · ${fmt(totalValor)}</span>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="val">${rows.length}</div>
    <div class="lbl">Documentos pendientes</div>
  </div>
  <div class="summary-card">
    <div class="val">${rows.reduce((s, r) => s + Number(r.total_sobrecostos), 0)}</div>
    <div class="lbl">Total sobrecostos</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${fmt(totalValor)}</div>
    <div class="lbl">Valor total pendiente</div>
  </div>
  <div class="summary-card">
    <div class="val" style="color:#dc2626">${rows.filter(r => r.dias_abierto >= 15).length}</div>
    <div class="lbl">+15 días sin aprobar</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Planilla</th>
      <th>Placa</th>
      <th>Fecha</th>
      <th style="text-align:center">Días abierto</th>
      <th style="text-align:center"># Sobrecostos</th>
      <th style="text-align:right">Valor total</th>
      <th>Referencia</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="4">TOTAL</td>
      <td style="text-align:center">${rows.reduce((s, r) => s + Number(r.total_sobrecostos), 0)}</td>
      <td style="text-align:right">${fmt(totalValor)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

<div class="footer">OrbitM7 · Milla 7 S.A.S. · Generado ${now}</div>
</body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' } });
    const base64 = Buffer.from(pdfBuffer).toString('base64');
    const fileName = `Sobrecostos_Pendientes_${now.replace(/\//g, '-')}.pdf`;
    const caption = `💰 *Sobrecostos Pendientes — ${now}*\n${rows.length} documento(s) · ${fmt(totalValor)} por aprobar`;
    return { base64, fileName, caption };
  } finally {
    await browser.close();
  }
}
