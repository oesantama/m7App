import puppeteer from 'puppeteer';
import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../../public/logo-encuesta.png');
function getLogoBase64(): string {
  try {
    const buf = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

interface FlotaRow { client_name: string; operator: string; city: string; quantity: number; }

function yesterday(): { from: string; to: string } {
  // Obtener la fecha actual en Colombia (UTC-5) para evitar el desfase de zona horaria.
  // Si el cron dispara a las 7 PM Colombia, en UTC ya es medianoche del día siguiente.
  const bogotaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [y, m, d] = bogotaHoy.split('-').map(Number);
  const ayer = new Date(y, m - 1, d - 1);
  const iso = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
  return { from: iso, to: iso };
}

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const s = dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.toUpperCase();
}

async function queryFlota(from: string, to: string): Promise<FlotaRow[]> {
  const result = await pool.query(
    `WITH manifests AS (
        SELECT TRIM(client_name) AS client_name, 1 AS quantity,
               'M7' AS operator,
               COALESCE(UPPER(TRIM(city)), 'SIN CIUDAD') AS city
        FROM management_orders
        WHERE manifest_date::date BETWEEN $1 AND $2
          AND manifest_status NOT IN ('ANULADO','CANCELADO','ANULADA')
          AND manifest_date IS NOT NULL
     ),
     tdm_excel AS (
        SELECT CONCAT('TDM ', TRIM(c.name)) AS client_name, 1 AS quantity, 'TDM' AS operator,
               COALESCE(UPPER(TRIM(ftm.ciudad_destino)), 'SIN CIUDAD') AS city
        FROM flota_tdm_manifiestos ftm
        LEFT JOIN clients c ON ftm.client_id = c.id
        WHERE ftm.fecha_operacion BETWEEN $1 AND $2
     ),
     combined AS (SELECT * FROM manifests UNION ALL SELECT * FROM tdm_excel)
    SELECT client_name, operator, city, SUM(quantity)::int AS quantity
    FROM combined GROUP BY client_name, operator, city ORDER BY operator, quantity DESC`,
    [from, to]
  );
  return result.rows;
}

async function queryVehiculos(from: string, to: string): Promise<{ m7: number; tdm: number }> {
  const [m7Res, tdmRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT UPPER(TRIM(plate)))::int AS n
       FROM management_orders
       WHERE manifest_date::date BETWEEN $1 AND $2
         AND manifest_status NOT IN ('ANULADO','CANCELADO','ANULADA')
         AND manifest_date IS NOT NULL
         AND plate IS NOT NULL AND TRIM(plate) <> ''`,
      [from, to]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT UPPER(TRIM(placa)))::int AS n
       FROM flota_tdm_manifiestos
       WHERE fecha_operacion BETWEEN $1 AND $2
         AND placa IS NOT NULL AND TRIM(placa) <> ''`,
      [from, to]
    ),
  ]);
  return { m7: m7Res.rows[0]?.n || 0, tdm: tdmRes.rows[0]?.n || 0 };
}

const fmt = (n: number) => n.toLocaleString('es-CO');
const pct0 = (n: number, t: number) => t > 0 ? Math.round((n / t) * 100) : 0;
const pctComma = (n: number, t: number) => t > 0 ? ((n / t) * 100).toFixed(1).replace('.', ',') : '0';

// Paleta clásica de gráficos Excel (tema Office), ciclando cuando hay más de 6 categorías.
const PALETTE = [
  '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47',
  '#264478', '#9E480E', '#636363', '#997300', '#255E91', '#43682B',
  '#698ED0', '#F1975A', '#B7B7B7', '#FFCD33',
];

interface Seg { name: string; qty: number; start: number; end: number; mid: number; color: string; }

function buildSegments(items: [string, number][], total: number): Seg[] {
  let cum = 0;
  return items.map(([name, qty], i) => {
    const start = (cum / total) * 360;
    cum += qty;
    const end = (cum / total) * 360;
    return { name, qty, start, end, mid: (start + end) / 2, color: PALETTE[i % PALETTE.length] };
  });
}

/** Punto sobre el borde de la elipse (vista "3D" achatada) para un ángulo (0°=arriba),
 *  en el sentido visual antihorario que usa Excel para el primer slice. */
function edgePoint(cx: number, cy: number, rx: number, ry: number, thetaDeg: number): { x: number; y: number } {
  const t = (thetaDeg * Math.PI) / 180;
  return { x: cx - rx * Math.sin(t), y: cy - ry * Math.cos(t) };
}

function isLeftSide(thetaDeg: number): boolean {
  return Math.sin((thetaDeg * Math.PI) / 180) >= 0;
}

/** Gráfica de pastel 2D plana, con etiquetas y líneas de llamada replicando el layout de Excel:
 *  slices grandes con etiqueta directa al lado (sin línea) y slices pequeños apilados con leader-line. */
function pieWithLabels(items: [string, number][], total: number, size: number, leftW: number, rightW: number): string {
  const r = size / 2;

  if (!items.length || total <= 0) {
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#e5e5e5;flex-shrink:0"></div>`;
  }
  if (items.length === 1) {
    const [name] = items[0];
    return `<div style="position:relative;width:${leftW + size + rightW}px;height:${size}px;flex-shrink:0">
      <div style="position:absolute;left:${leftW}px;top:0;width:${size}px;height:${size}px;border-radius:50%;background:${PALETTE[0]};
        box-shadow:0 1px 3px rgba(0,0,0,.18), inset 0 0 0 1.5px rgba(255,255,255,.5)"></div>
      <div style="position:absolute;left:${leftW}px;top:0;width:${size}px;height:${size}px;border-radius:50%;pointer-events:none;
        background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.4), rgba(255,255,255,0) 55%)"></div>
      <div style="position:absolute;left:${leftW + size + 4}px;top:${size / 2 - 9}px;width:${rightW - 4}px;text-align:left">
        <div style="font-size:6.8px;font-weight:800;color:#1a1a1a;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
        <div style="font-size:6px;color:#8a8a8a;line-height:1.1">100%</div>
      </div>
    </div>`;
  }

  const segs = buildSegments(items, total);
  const rowH = 16;
  const cxLocal = leftW + r;

  type Row = { seg: Seg; anchorX: number; anchorY: number; y: number };
  const left: Row[] = [];
  const right: Row[] = [];
  segs.forEach(seg => {
    const a = edgePoint(cxLocal, r, r, r, seg.mid);
    const row: Row = { seg, anchorX: a.x, anchorY: a.y, y: a.y };
    (isLeftSide(seg.mid) ? left : right).push(row);
  });
  const declutter = (arr: Row[]) => {
    arr.sort((a, b) => a.y - b.y);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].y < arr[i - 1].y + rowH) arr[i].y = arr[i - 1].y + rowH;
    }
  };
  declutter(left);
  declutter(right);

  const allY = [0, size, ...left.map(x => x.y), ...left.map(x => x.y + rowH), ...right.map(x => x.y), ...right.map(x => x.y + rowH)];
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const shift = -minY;
  const height = maxY - minY;

  const gradient = segs.map(s => `${s.color} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`).join(', ');

  const label = (row: Row, side: 'left' | 'right') => {
    const y = row.y + shift;
    const pct = pctComma(row.seg.qty, total);
    if (side === 'left') {
      return `<div style="position:absolute;left:0;top:${y}px;width:${leftW - 4}px;text-align:right">
        <div style="font-size:6.8px;font-weight:800;color:#1a1a1a;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row.seg.name}</div>
        <div style="font-size:6px;color:#8a8a8a;line-height:1.1">${pct}%</div>
      </div>`;
    }
    return `<div style="position:absolute;left:${leftW + size + 4}px;top:${y}px;width:${rightW - 4}px;text-align:left">
      <div style="font-size:6.8px;font-weight:800;color:#1a1a1a;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${row.seg.name}</div>
      <div style="font-size:6px;color:#8a8a8a;line-height:1.1">${pct}%</div>
    </div>`;
  };

  const leaderLines = right.map(row => {
    const x1 = row.anchorX, y1 = row.anchorY + shift;
    const x2 = leftW + size + 2, y2 = row.y + shift + 5;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#a8a8a8" stroke-width="0.6"/>`;
  }).join('');

  // Líneas blancas entre porciones para que cada slice se distinga con nitidez.
  const pieCx = cxLocal, pieCy = r + shift;
  const boundaries = [...new Set(segs.map(s => s.start))];
  const separators = boundaries.map(b => {
    const p = edgePoint(pieCx, pieCy, r, r, b);
    return `<line x1="${pieCx}" y1="${pieCy.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#ffffff" stroke-width="1.4"/>`;
  }).join('');

  return `<div style="position:relative;width:${leftW + size + rightW}px;height:${height}px;flex-shrink:0">
    <div style="position:absolute;left:${leftW}px;top:${shift}px;width:${size}px;height:${size}px;border-radius:50%;
      background:conic-gradient(${gradient});transform:scaleX(-1);
      box-shadow:0 1px 3px rgba(0,0,0,.18), inset 0 0 0 1.5px rgba(255,255,255,.5)"></div>
    <svg width="${leftW + size + rightW}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none">${separators}</svg>
    <div style="position:absolute;left:${leftW}px;top:${shift}px;width:${size}px;height:${size}px;border-radius:50%;pointer-events:none;
      background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.35), rgba(255,255,255,0) 55%)"></div>
    <svg width="${leftW + size + rightW}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none">${leaderLines}</svg>
    ${left.map(row => label(row, 'left')).join('')}
    ${right.map(row => label(row, 'right')).join('')}
  </div>`;
}

function buildHtml(rows: FlotaRow[], vehiculos: { m7: number; tdm: number }, fecha: string, logoSrc: string): string {
  const m7Rows  = rows.filter(r => r.operator === 'M7');
  const tdmRows = rows.filter(r => r.operator === 'TDM');
  const totalM7  = m7Rows.reduce((s, r) => s + r.quantity, 0);
  const totalTDM = tdmRows.reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;
  const uniqueClients = new Set(rows.map(r => r.client_name)).size;

  const m7Client = new Map<string, number>();
  m7Rows.forEach(r => m7Client.set(r.client_name, (m7Client.get(r.client_name) || 0) + r.quantity));
  const m7ClientList = [...m7Client.entries()].sort((a, b) => b[1] - a[1]);

  const tdmClient = new Map<string, number>();
  tdmRows.forEach(r => tdmClient.set(r.client_name, (tdmClient.get(r.client_name) || 0) + r.quantity));
  const tdmClientList = [...tdmClient.entries()].sort((a, b) => b[1] - a[1]);

  // Top 2 ciudades por volumen (combinando M7 + TDM)
  const cityTotals = new Map<string, number>();
  rows.forEach(r => cityTotals.set(r.city, (cityTotals.get(r.city) || 0) + r.quantity));
  const topCities = [...cityTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

  const cityClientBreakdown = (city: string): [string, number][] => {
    const m = new Map<string, number>();
    rows.filter(r => r.city === city).forEach(r => m.set(r.client_name, (m.get(r.client_name) || 0) + r.quantity));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const tablaRow = (name: string, qty: number, bold = false) => `
    <tr${bold ? ' style="background:#C6E0B4;font-weight:800"' : ''}>
      <td style="padding:1.5px 4px;text-align:left;color:#666;width:24px;border-bottom:1px solid #e2e2e2">${bold ? '' : pct0(qty, total) + '%'}</td>
      <td style="padding:1.5px 4px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid #e2e2e2" title="${name}">${bold ? '' : name}</td>
      <td style="padding:1.5px 4px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2">${fmt(qty)}</td>
    </tr>`;

  const TABLA_IZQ = `
  <table style="width:100%;border-collapse:collapse;font-size:7.2px">
    <thead><tr style="background:#D9D9D9;color:#1a1a1a">
      <th colspan="2" style="padding:3px 4px;text-align:left;font-style:italic">M7</th>
      <th style="padding:3px 4px;text-align:right">TOTAL</th>
    </tr></thead>
    <tbody>
      ${m7ClientList.map(([n, q]) => tablaRow(n, q)).join('')}
      ${tablaRow('', totalM7, true)}
      ${tdmClientList.map(([n, q]) => tablaRow(n, q)).join('')}
      ${tablaRow('', totalTDM, true)}
      <tr style="background:#A9D18E;font-weight:900">
        <td colspan="2" style="padding:3px 4px"></td>
        <td style="padding:3px 4px;text-align:right">${fmt(total)}</td>
      </tr>
    </tbody>
  </table>`;

  const flotaBlock = (titulo: string, items: [string, number][], subtotal: number) => `
  <div style="border:1px solid #bbb;padding:5px 6px;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:10.5px;font-weight:900;color:#1a1a1a">${titulo}</div>
        <div style="font-size:19px;font-weight:900;color:#3CB44B;line-height:1">${fmt(subtotal)}</div>
      </div>
      <div style="font-size:16px;font-weight:900;color:#1F6FD0">${pct0(subtotal, total)}%</div>
    </div>
    <div style="display:flex;justify-content:center;margin-top:2px">
      ${pieWithLabels(items, subtotal, 96, 82, 124)}
    </div>
  </div>`;

  const cityBlock = (city: string, cityTotal: number, items: [string, number][]) => `
  <div style="border:1px solid #bbb;padding:5px 6px">
    <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:1px">
      <div style="font-size:9px;font-weight:900;color:#1a1a1a">${city}</div>
      <div style="font-size:14px;font-weight:900;color:#1a1a1a">${fmt(cityTotal)}</div>
    </div>
    <div style="display:flex;justify-content:center">
      ${pieWithLabels(items, cityTotal, 56, 56, 88)}
    </div>
  </div>`;

  const totalVehiculos = vehiculos.m7 + vehiculos.tdm;
  const barW = (n: number) => totalVehiculos > 0 ? (n / Math.max(vehiculos.m7, vehiculos.tdm, 1)) * 100 : 0;
  const OPERACIONES = `
  <div style="border:1px solid #bbb;padding:6px 10px;margin-top:6px">
    <div style="font-size:10.5px;font-weight:900;color:#1a1a1a;margin-bottom:4px">OPERACIONES</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:74px;font-size:8.5px;font-weight:800;color:#1a1a1a">M7: ${pct0(vehiculos.m7, totalVehiculos)}%</span>
        <div style="flex:1;height:14px;background:#eef0f2"><div style="height:100%;width:${barW(vehiculos.m7)}%;background:#8FAABE;min-width:2px"></div></div>
        <span style="width:24px;font-size:11px;font-weight:900;color:#1a1a1a;text-align:right">${vehiculos.m7}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:74px;font-size:8.5px;font-weight:800;color:#1a1a1a">TDM: ${pct0(vehiculos.tdm, totalVehiculos)}%</span>
        <div style="flex:1;height:14px;background:#eef0f2"><div style="height:100%;width:${barW(vehiculos.tdm)}%;background:#8FAABE;min-width:2px"></div></div>
        <span style="width:24px;font-size:11px;font-weight:900;color:#1a1a1a;text-align:right">${vehiculos.tdm}</span>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Calibri,Arial,sans-serif;font-size:10px;color:#1a1a1a;background:#fff;width:794px;padding:14px 16px}
</style></head><body>

<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
  <div style="text-align:center">
    <div style="font-size:26px;font-weight:900;color:#3CB44B;line-height:1">${fmt(total)}</div>
    <div style="font-size:6.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#777;margin-top:2px">Total viajes</div>
  </div>
  <div style="text-align:center">
    ${logoSrc ? `<img src="${logoSrc}" style="height:38px;object-fit:contain;margin-bottom:3px" alt="logo">` : ''}
    <div style="font-size:19px;font-weight:900;letter-spacing:.3px;color:#1a1a1a;white-space:nowrap">${fecha}</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:26px;font-weight:900;color:#1a1a1a;border:1.5px solid #1a1a1a;padding:2px 16px;line-height:1.2">${uniqueClients}</div>
    <div style="font-size:6.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#777;margin-top:2px">Clientes</div>
  </div>
</div>

<div style="display:flex;gap:6px">
  <div style="display:flex;flex-direction:column">
    <div style="display:flex;gap:6px">
      <div style="width:224px;flex-shrink:0;border:1px solid #bbb">${TABLA_IZQ}</div>
      <div style="width:320px;flex-shrink:0;display:flex;flex-direction:column;gap:6px">
        ${flotaBlock('FLOTA M7', m7ClientList, totalM7)}
        ${flotaBlock('FLOTA TDM', tdmClientList, totalTDM)}
      </div>
    </div>
    ${OPERACIONES}
  </div>
  <div style="width:214px;flex-shrink:0;display:flex;flex-direction:column;gap:6px">
    ${topCities.map(([city, qty]) => cityBlock(city, qty, cityClientBreakdown(city))).join('')}
  </div>
</div>

<div style="border-top:1.5px solid #1a1a1a;margin-top:8px;padding-top:5px;display:flex;justify-content:space-between;font-size:7.5px;color:#444">
  <span><strong style="color:#1a1a1a">OrbitM7</strong> — Milla 7 S.A.S.</span>
  <span>Fecha: ${fecha} &nbsp;|&nbsp; Total: <strong style="color:#1a1a1a">${fmt(total)}</strong> viajes &nbsp;|&nbsp; M7: <strong style="color:#1a1a1a">${fmt(totalM7)}</strong> &nbsp;TDM: <strong style="color:#1a1a1a">${fmt(totalTDM)}</strong></span>
</div>

</body></html>`;
}

export async function generateFlotaReportPdf(fechaOverride?: string): Promise<{ base64: string; fileName: string; caption: string }> {
  const { from } = fechaOverride ? { from: fechaOverride } : yesterday();
  const [rows, vehiculos] = await Promise.all([
    queryFlota(from, from),
    queryVehiculos(from, from),
  ]);

  const totalM7  = rows.filter(r => r.operator === 'M7').reduce((s, r) => s + r.quantity, 0);
  const totalTDM = rows.filter(r => r.operator === 'TDM').reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;

  const logoSrc = getLogoBase64();
  const fechaLarga = formatFechaLarga(from);
  const html = buildHtml(rows, vehiculos, fechaLarga, logoSrc);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMediaType('print');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    const base64 = `data:application/pdf;base64,${Buffer.from(pdfBuffer).toString('base64')}`;
    const fileName = `InformeFlota_${from}.pdf`;
    const caption = `📊 *Informe Flota OrbitM7*\nFecha: ${from}\nTotal: ${total} (M7: ${totalM7} | TDM: ${totalTDM})`;
    return { base64, fileName, caption };
  } finally {
    await browser.close();
  }
}
