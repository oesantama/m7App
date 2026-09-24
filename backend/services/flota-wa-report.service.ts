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

/** Punto sobre el borde de la elipse para un ángulo (0°=arriba). */
function edgePoint(cx: number, cy: number, rx: number, ry: number, thetaDeg: number): { x: number; y: number } {
  const t = (thetaDeg * Math.PI) / 180;
  return { x: cx - rx * Math.sin(t), y: cy - ry * Math.cos(t) };
}

/** Gráfica de pastel 2D agrandada al margen del recuadro (diámetro 250px), con porcentajes internos más hacia la orilla y únicamente las etiquetas de 1% afuera con línea guía. */
function pieOnlyPercentages(items: [string, number][], subtotal: number, grandTotal: number, size: number = 270): string {
  const cx = size / 2;
  const cy = size / 2;
  const rPie = (size / 2) - 10; // 125px de radio para la torta (diámetro 250px), llenando casi todo el recuadro

  if (!items.length || subtotal <= 0) {
    return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center"><div style="width:${rPie*2}px;height:${rPie*2}px;border-radius:50%;background:#e5e5e5"></div></div>`;
  }

  if (items.length === 1) {
    const p = pct0(items[0][1], grandTotal);
    return `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
      <div style="position:relative;width:${rPie*2}px;height:${rPie*2}px;border-radius:50%;background:${PALETTE[0]};
        box-shadow:0 3px 10px rgba(0,0,0,.18), inset 0 0 0 2px rgba(255,255,255,.6)">
        <div style="position:absolute;inset:0;border-radius:50%;pointer-events:none;
          background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.35), rgba(255,255,255,0) 60%)"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font-size:32px;font-weight:900;color:#ffffff;text-shadow:0 2px 4px rgba(0,0,0,0.7)">${p}%</div>
      </div>
    </div>`;
  }

  const segs = buildSegments(items, subtotal);
  const gradient = segs.map(s => `${s.color} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`).join(', ');

  const boundaries = [...new Set(segs.map(s => s.start))];
  const separators = boundaries.map(b => {
    const p = edgePoint(rPie, rPie, rPie, rPie, b);
    return `<line x1="${rPie}" y1="${rPie}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#ffffff" stroke-width="1.5"/>`;
  }).join('');

  interface InternalLabel { type: 'in'; pctText: string; lx: number; ly: number; fontSize: string }
  interface ExternalLabel { type: 'out'; pctText: string; ex: number; ey: number; lx: number; ly: number; side: 'left' | 'right' }

  const insideLabels: InternalLabel[] = [];
  const leftExternal: ExternalLabel[] = [];
  const rightExternal: ExternalLabel[] = [];

  segs.forEach(seg => {
    const pctVal = pct0(seg.qty, grandTotal);
    if (pctVal < 1) return;

    const pctText = `${pctVal}%`;
    const thetaRad = (seg.mid * Math.PI) / 180;
    const subPct = (seg.qty / subtotal) * 100;

    // Solo se sacan del gráfico las etiquetas que indican 1% (para evitar sobreescritura)
    if (pctVal <= 1) {
      const ex = cx - rPie * Math.sin(thetaRad);
      const ey = cy - rPie * Math.cos(thetaRad);
      const distOut = rPie + 16;
      const lx = cx - distOut * Math.sin(thetaRad);
      const ly = cy - distOut * Math.cos(thetaRad);
      const side = Math.sin(thetaRad) >= 0 ? 'left' : 'right';

      const item: ExternalLabel = { type: 'out', pctText, ex, ey, lx, ly, side };
      if (side === 'left') leftExternal.push(item);
      else rightExternal.push(item);
    } else {
      // Para las etiquetas internas (2% en adelante), se colocan más hacia la orilla del corte (distMult mayor)
      let distMult = 0.70;
      let fontSize = '12px';

      if (subPct >= 15) {
        distMult = 0.65;
        fontSize = '15px';
      } else if (subPct >= 6) {
        distMult = 0.72;
        fontSize = '13px';
      } else if (subPct >= 3) {
        distMult = 0.76;
        fontSize = '10.5px';
      } else { // 2%
        distMult = 0.76;
        fontSize = '8.5px';
      }

      const dist = rPie * distMult;
      const lx = cx - dist * Math.sin(thetaRad);
      const ly = cy - dist * Math.cos(thetaRad);

      insideLabels.push({ type: 'in', pctText, lx, ly, fontSize });
    }
  });

  // Ordenar y desaglomerar etiquetas externas (únicamente 1%) por eje Y
  leftExternal.sort((a, b) => a.ly - b.ly);
  rightExternal.sort((a, b) => a.ly - b.ly);

  const declutter = (arr: ExternalLabel[]) => {
    const minGap = 16;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].ly < arr[i - 1].ly + minGap) {
        arr[i].ly = arr[i - 1].ly + minGap;
      }
    }
  };
  declutter(leftExternal);
  declutter(rightExternal);

  const allExternal = [...leftExternal, ...rightExternal];

  const leaderLinesSvg = allExternal.map(l =>
    `<line x1="${l.ex.toFixed(1)}" y1="${l.ey.toFixed(1)}" x2="${l.lx.toFixed(1)}" y2="${l.ly.toFixed(1)}" stroke="#444444" stroke-width="1.2" stroke-dasharray="2,2"/>`
  ).join('');

  const insideHtml = insideLabels.map(l => {
    const style = `position:absolute;left:${l.lx.toFixed(1)}px;top:${l.ly.toFixed(1)}px;transform:translate(-50%,-50%);font-size:${l.fontSize};font-weight:900;color:#ffffff;text-shadow:0 1px 3px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95);white-space:nowrap;pointer-events:none`;
    return `<div style="${style}">${l.pctText}</div>`;
  }).join('');

  const externalHtml = allExternal.map(l => {
    const style = `position:absolute;left:${l.lx.toFixed(1)}px;top:${l.ly.toFixed(1)}px;transform:translate(-50%,-50%);font-size:9px;font-weight:900;color:#1a1a1a;background:rgba(255,255,255,0.95);padding:1px 4px;border:1px solid #999;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;pointer-events:none`;
    return `<div style="${style}">${l.pctText}</div>`;
  }).join('');

  return `
  <div style="position:relative;width:${size}px;height:${size}px">
    <div style="position:absolute;left:${cx - rPie}px;top:${cy - rPie}px;width:${rPie*2}px;height:${rPie*2}px;border-radius:50%;
      background:conic-gradient(${gradient});transform:scaleX(-1);
      box-shadow:0 3px 10px rgba(0,0,0,.18), inset 0 0 0 1.5px rgba(255,255,255,.5)"></div>
    <svg width="${rPie*2}" height="${rPie*2}" style="position:absolute;left:${cx - rPie}px;top:${cy - rPie}px;pointer-events:none">${separators}</svg>
    <div style="position:absolute;left:${cx - rPie}px;top:${cy - rPie}px;width:${rPie*2}px;height:${rPie*2}px;border-radius:50%;pointer-events:none;
      background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.32), rgba(255,255,255,0) 55%)"></div>
    <svg width="${size}" height="${size}" style="position:absolute;inset:0;pointer-events:none">${leaderLinesSvg}</svg>
    <div style="position:absolute;inset:0;pointer-events:none">${insideHtml}${externalHtml}</div>
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

  // Clasificación estricta en 2 ciudades: CALI (si el cliente o ciudad contiene CALI) y MEDELLIN (el resto)
  let caliQty = 0;
  let medellinQty = 0;
  rows.forEach(r => {
    const cName = (r.client_name || '').toUpperCase();
    const cCity = (r.city || '').toUpperCase();
    if (cName.includes('CALI') || cCity.includes('CALI')) {
      caliQty += r.quantity;
    } else {
      medellinQty += r.quantity;
    }
  });

  const cityList: [string, number][] = [];
  if (medellinQty > 0 || total === 0) cityList.push(['MEDELLIN', medellinQty]);
  if (caliQty > 0) cityList.push(['CALI', caliQty]);

  const tablaRow = (name: string, qty: number) => `
    <tr>
      <td style="padding:2.5px 2px;text-align:center;color:#555;border-bottom:1px solid #e2e2e2;white-space:nowrap">${pct0(qty, total)}%</td>
      <td style="padding:2.5px 6px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid #e2e2e2;color:#333" title="${name}">${name}</td>
      <td style="padding:2.5px 4px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2;white-space:nowrap;color:#1a1a1a">${fmt(qty)}</td>
    </tr>`;

  const TABLA_IZQ = `
  <div style="font-size:15px;font-weight:900;text-align:center;color:#1a1a1a;margin-bottom:6px;padding-bottom:3px;border-bottom:2px solid #3CB44B;text-transform:uppercase">
    RESUMEN POR CLIENTE
  </div>
  <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:7.8px">
    <colgroup>
      <col style="width:38px">
      <col style="width:214px">
      <col style="width:48px">
    </colgroup>
    <thead>
      <tr style="background:#D9D9D9;color:#1a1a1a;font-weight:900;font-size:9px">
        <th style="padding:4px 2px;text-align:center">%</th>
        <th style="padding:4px 6px;text-align:left">CLIENTE</th>
        <th style="padding:4px 4px;text-align:right">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#E2EFDA;font-weight:900;font-size:11px">
        <td colspan="3" style="padding:3.5px 6px;text-align:center;color:#1e4d2b;border-bottom:1px solid #c2dfb8;letter-spacing:0.5px">M7</td>
      </tr>
      ${m7ClientList.map(([n, q]) => tablaRow(n, q)).join('')}
      <tr style="background:#C6E0B4;font-weight:900;font-size:8.5px;color:#1e4d2b">
        <td style="padding:3px 2px;text-align:center;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">${pct0(totalM7, total)}%</td>
        <td style="padding:3px 6px;text-align:left;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">TOTAL M7</td>
        <td style="padding:3px 4px;text-align:right;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">${fmt(totalM7)}</td>
      </tr>
      <tr style="background:#E2EFDA;font-weight:900;font-size:11px">
        <td colspan="3" style="padding:3.5px 6px;text-align:center;color:#1e4d2b;border-bottom:1px solid #c2dfb8;letter-spacing:0.5px">TDM</td>
      </tr>
      ${tdmClientList.map(([n, q]) => tablaRow(n, q)).join('')}
      <tr style="background:#C6E0B4;font-weight:900;font-size:8.5px;color:#1e4d2b">
        <td style="padding:3px 2px;text-align:center;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">${pct0(totalTDM, total)}%</td>
        <td style="padding:3px 6px;text-align:left;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">TOTAL TDM</td>
        <td style="padding:3px 4px;text-align:right;border-top:1px solid #a8c690;border-bottom:1px solid #a8c690">${fmt(totalTDM)}</td>
      </tr>
      <tr style="background:#A9D18E;font-weight:900;font-size:9px;color:#14371e">
        <td style="padding:4px 2px;text-align:center;border-top:1.5px solid #82b463">100%</td>
        <td style="padding:4px 6px;text-align:left;border-top:1.5px solid #82b463">TOTAL GENERAL</td>
        <td style="padding:4px 4px;text-align:right;border-top:1.5px solid #82b463">${fmt(total)}</td>
      </tr>
    </tbody>
  </table>`;

  const barW = (n: number) => total > 0 ? (n / Math.max(totalM7, totalTDM, 1)) * 100 : 0;
  const OPERACIONES = `
  <div style="border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin-top:8px;background:#fff">
    <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:6px;text-align:center;text-transform:uppercase">OPERACIONES</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:75px;font-size:9px;font-weight:800;color:#1a1a1a">M7: ${pct0(totalM7, total)}%</span>
        <div style="flex:1;height:14px;background:#eef0f2;border-radius:2px;overflow:hidden"><div style="height:100%;width:${barW(totalM7)}%;background:#8FAABE;min-width:2px"></div></div>
        <span style="width:28px;font-size:11px;font-weight:900;color:#1a1a1a;text-align:right">${fmt(totalM7)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:75px;font-size:9px;font-weight:800;color:#1a1a1a">TDM: ${pct0(totalTDM, total)}%</span>
        <div style="flex:1;height:14px;background:#eef0f2;border-radius:2px;overflow:hidden"><div style="height:100%;width:${barW(totalTDM)}%;background:#8FAABE;min-width:2px"></div></div>
        <span style="width:28px;font-size:11px;font-weight:900;color:#1a1a1a;text-align:right">${fmt(totalTDM)}</span>
      </div>
    </div>
  </div>`;

  const CIUDADES = `
  <div style="border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin-top:8px;background:#fff">
    <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:6px;text-align:center;text-transform:uppercase">RESUMEN POR CIUDAD</div>
    <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:7.8px">
      <colgroup>
        <col style="width:38px">
        <col style="width:214px">
        <col style="width:48px">
      </colgroup>
      <thead>
        <tr style="background:#D9D9D9;color:#1a1a1a;font-weight:900;font-size:9px">
          <th style="padding:4px 2px;text-align:center">%</th>
          <th style="padding:4px 6px;text-align:left">CIUDAD</th>
          <th style="padding:4px 4px;text-align:right">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${cityList.map(([city, qty]) => `
          <tr>
            <td style="padding:3px 2px;text-align:center;color:#555;border-bottom:1px solid #e2e2e2">${pct0(qty, total)}%</td>
            <td style="padding:3px 6px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid #e2e2e2;color:#333;font-weight:800">${city}</td>
            <td style="padding:3px 4px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2;color:#1a1a1a">${fmt(qty)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;

  const flotaBlock = (titulo: string, items: [string, number][], subtotal: number) => `
  <div style="border:1px solid #bbb;border-radius:6px;padding:10px 14px;background:#fff;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center">
    <div style="font-size:15px;font-weight:900;text-align:center;text-transform:uppercase;margin-bottom:6px;width:100%;white-space:nowrap">
      <span style="color:#1a1a1a">${titulo}</span> — <span style="color:#3CB44B">${fmt(subtotal)} viajes</span> <span style="color:#1F6FD0">(${pct0(subtotal, total)}%)</span>
    </div>
    <div style="display:flex;justify-content:center;align-items:center;padding:2px 0;width:100%;flex:1">
      ${pieOnlyPercentages(items, subtotal, total, 280)}
    </div>
  </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Calibri,Arial,sans-serif;font-size:10px;color:#1a1a1a;background:#fff;width:794px;padding:16px}
</style></head><body>

<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
  <div style="text-align:center">
    <div style="font-size:28px;font-weight:900;color:#3CB44B;line-height:1">${fmt(total)}</div>
    <div style="font-size:7px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#777;margin-top:2px">Total viajes</div>
  </div>
  <div style="text-align:center">
    ${logoSrc ? `<img src="${logoSrc}" style="height:54px;object-fit:contain;margin-bottom:3px" alt="logo">` : ''}
    <div style="font-size:20px;font-weight:900;letter-spacing:.3px;color:#1a1a1a;white-space:nowrap">${fecha}</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:26px;font-weight:900;color:#1a1a1a;border:1.5px solid #1a1a1a;padding:2px 16px;line-height:1.2">${uniqueClients}</div>
    <div style="font-size:7px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#777;margin-top:2px">Clientes</div>
  </div>
</div>

<div style="display:flex;gap:12px;align-items:stretch">
  <div style="width:315px;flex-shrink:0;display:flex;flex-direction:column">
    <div style="border:1px solid #bbb;border-radius:6px;padding:8px 10px;background:#fff">
      ${TABLA_IZQ}
    </div>
    ${OPERACIONES}
    ${CIUDADES}
  </div>
  <div style="flex:1;display:flex;flex-direction:column;gap:12px">
    ${flotaBlock('FLOTA M7', m7ClientList, totalM7)}
    ${flotaBlock('FLOTA TDM', tdmClientList, totalTDM)}
  </div>
</div>

<div style="border-top:1.5px solid #1a1a1a;margin-top:12px;padding-top:6px;display:flex;justify-content:space-between;font-size:8px;color:#444">
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
