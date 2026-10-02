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

interface FlotaRow { client_name: string; operator: string; city: string; quantity: number; cxc: number; cxp: number; }

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

async function fetchClientsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await pool.query("SELECT id, name, short_name FROM clients WHERE short_name IS NOT NULL AND TRIM(short_name) <> ''");
    const clientMapById = new Map<string, string>();
    for (const r of res.rows) {
      if (r.name && r.short_name) {
        const fullUpper = r.name.trim().toUpperCase();
        const shortClean = r.short_name.trim();
        map.set(fullUpper, shortClean);
        map.set(shortClean.toUpperCase(), shortClean);
        if (r.id) clientMapById.set(r.id.trim().toUpperCase(), shortClean);
      }
    }

    const provRes = await pool.query("SELECT nombre, client_mappings FROM prov_cliente WHERE client_mappings IS NOT NULL AND jsonb_array_length(client_mappings::jsonb) > 0");
    for (const p of provRes.rows) {
      const provName = p.nombre ? p.nombre.trim().toUpperCase() : '';
      const mappings = Array.isArray(p.client_mappings) ? p.client_mappings : [];
      for (const m of mappings) {
        const cId = m.clientId ? String(m.clientId).trim().toUpperCase() : '';
        const cName = m.clientName ? String(m.clientName).trim() : '';
        const targetShort = (cId && clientMapById.has(cId)) ? clientMapById.get(cId)! : (cName || cId);
        if (targetShort) {
          if (m.managementName) map.set(m.managementName.trim().toUpperCase(), targetShort.trim());
          if (provName) map.set(provName, targetShort.trim());
        }
      }
    }
  } catch (e) {
    console.warn('[FLOTA-REPORT] Error fetching clientsMap:', e);
  }
  return map;
}

export function toShortClientName(rawName: string, clientsMap: Map<string, string>): string {
  if (!rawName) return '';
  let trimmed = rawName.trim();

  // Strip duplicate TDM prefixes (e.g. "TDM TDM-LEO" -> "TDM-LEO")
  while (/^TDM\s+TDM/i.test(trimmed)) {
    trimmed = trimmed.replace(/^TDM\s+/i, '').trim();
  }

  const isTDM = /^TDM\b/i.test(trimmed);
  const cleanName = isTDM ? trimmed.replace(/^TDM\s*/i, '').trim() : trimmed;
  const upper = cleanName.toUpperCase();

  const formatResult = (res: string) => {
    if (!isTDM) return res;
    if (/^TDM/i.test(res)) return res; // Don't duplicate TDM if already present
    return `TDM ${res}`;
  };

  // 1. Direct match in clients table (fullName or shortName)
  if (clientsMap.has(upper)) {
    return formatResult(clientsMap.get(upper)!);
  }

  // 2. Normalized match without punctuation or corporate suffixes
  const normUpper = upper
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [fullName, shortName] of clientsMap.entries()) {
    const normFull = fullName.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normUpper === normFull) {
      return formatResult(shortName);
    }
  }

  // 3. Fallback dictionary for known client names in management_orders
  const dictionary: Record<string, string> = {
    'AJOVER M7_BODEGA36': 'AJV 36',
    'AJOVER_BODEGA10': 'AJV 10',
    'AJOVER BODEGA 10': 'AJV 10',
    'AJOVER BODEGA 36': 'AJV 36',
    'AJOVER CALI M7 LINA': 'AJV CALI',
    'AJOVER CALI DIANA LOBATON': 'AJV CALI',
    'AJOVER DARNEL S.A.S': 'AJV DARNEL',
    'GESTION Y DESARROLLO AMBIENTAL SAS E.S.P': 'GDA',
    'GESTION Y DESARROLLO AMBIENTAL': 'GDA',
    'SINETOR COLOMBIA S.A.S': 'ST',
    'SNETOR COLOMBIA S.A.S': 'ST',
    'DIANA CORPORACION S.A.S': 'DIANA',
    'AGAVAL S.A': 'AGAVAL',
    'RTD SAS': 'RTD',
    'TDM (PREBEL)': 'PREBEL',
    'ALBERTO CADAVID R. & CIA SA': 'CADAVID',
    'COMERCIALIZADORA INTERNACIONAL DE LLANTAS SAS': 'CI LLANTAS',
    'COMERCIALIZADORA INTERNACIONAL DE LLANTAS S.A.S.': 'CI LLANTAS',
    'ESPUMAS PLASTICAS S.A': 'ESPUMAS PLASTICAS',
    'LINEA DIRECTA S.A.S.': 'LINEA DIRECTA',
    'LINEA DIRECTA S.A.S': 'LINEA DIRECTA',
    'LOGISTICA,TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S': 'LTSA',
    'LOGISTICA, TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S': 'LTSA',
    'LOGISTICA TRANSPORTE Y SERVICIOS ASOCIADOS SAS': 'LTSA',
    'PAPELERIA Y SERVICIOS S.A.S.': 'PAPELERIA Y SERV',
    'PAPELERIA Y SERVICIOS S.A.S': 'PAPELERIA Y SERV',
    'PLASTICOS UNION SAS': 'PLASTICOS UNION',
    'SOLUCIONES LOGISTICAS Y EMPAQUES SAS': 'SOLUCIONES LOG',
    'SOLUCIONES LOGISTICAS Y EMPAQUES S.A.S.': 'SOLUCIONES LOG',
    'EXITO SECOS': 'E SEC',
    'EXITO LINEA BLANCA': 'E L BLANCA',
    'EXITO TAT': 'E TAT',
    'EXITO PLAN DE CONTINGENCIA': 'E CONTINGENCIA',
    'INVESA S.A': 'INVESA',
    'INVESA S.A.': 'INVESA',
    'NEROLI SAS': 'NEROLI',
    'NEROLI S.A.S.': 'NEROLI',
    'POLIKEM SAS': 'POLIKEM',
    'POLIKEM S.A.S.': 'POLIKEM',
    'NOVASEO SAS': 'NOVASEO',
    'NOVASEO S.A.S.': 'NOVASEO',
  };

  if (dictionary[upper]) {
    return formatResult(dictionary[upper]);
  }

  // 4. Substring match in clientsMap only if fullName is specific (>= 4 chars)
  for (const [fullName, shortName] of clientsMap.entries()) {
    if (fullName.length >= 4 && (upper.includes(fullName) || fullName.includes(upper))) {
      return formatResult(shortName);
    }
  }

  // 5. Algorithmic cleanup of corporate suffixes
  let result = cleanName
    .replace(/\bS\.?A\.?S\.?\b/gi, '')
    .replace(/\bE\.?S\.?P\.?\b/gi, '')
    .replace(/\bS\.?A\.?\b/gi, '')
    .replace(/\bC\.?I\.?\b/gi, '')
    .replace(/\bLTDA\.?\b/gi, '')
    .replace(/\b& CIA\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return formatResult(result);
}

async function queryFlota(from: string, to: string): Promise<FlotaRow[]> {
  const result = await pool.query(
    `WITH manifests AS (
        SELECT TRIM(client_name) AS client_name, 1 AS quantity,
               'M7' AS operator,
               COALESCE(UPPER(TRIM(city)), 'SIN CIUDAD') AS city,
               COALESCE(total_value_cxc_final, 0)::float AS cxc,
               COALESCE(total_value_cxp_final, 0)::float AS cxp
        FROM management_orders
        WHERE manifest_date::date BETWEEN $1 AND $2
          AND manifest_status NOT IN ('ANULADO','CANCELADO','ANULADA')
          AND manifest_date IS NOT NULL
     ),
     tdm_excel AS (
        SELECT CONCAT('TDM ', TRIM(COALESCE(c.name, ftm.client_id, 'DESCONOCIDO'))) AS client_name, 1 AS quantity, 'TDM' AS operator,
               COALESCE(UPPER(TRIM(ftm.ciudad_destino)), 'SIN CIUDAD') AS city,
               COALESCE(ftm.valor_cobrar, 0)::float AS cxc,
               COALESCE(ftm.valor_pagar, 0)::float AS cxp
        FROM flota_tdm_manifiestos ftm
        LEFT JOIN clients c ON ftm.client_id = c.id OR UPPER(TRIM(ftm.client_id)) = UPPER(TRIM(c.name))
        WHERE ftm.fecha_operacion BETWEEN $1 AND $2
     ),
     combined AS (SELECT * FROM manifests UNION ALL SELECT * FROM tdm_excel)
    SELECT client_name, operator, city,
           SUM(quantity)::int AS quantity,
           SUM(cxc)::float AS cxc,
           SUM(cxp)::float AS cxp
    FROM combined
    GROUP BY client_name, operator, city
    ORDER BY operator, quantity DESC`,
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
const fmtMoney = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;
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

function calcIntReal(rawPct: number, clientName?: string, dateStr?: string): number {
  if (rawPct <= 0) return 0;
  const cName = (clientName || '').toUpperCase();

  if (cName.includes('SOCODA')) {
    let cleanDate = '';
    if (dateStr) {
      const s = dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) cleanDate = s.slice(0, 10);
      else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        const parts = s.split('/');
        cleanDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else cleanDate = s.slice(0, 10);
    }
    if (cleanDate && cleanDate <= '2026-07-31') {
      return rawPct >= 20 ? rawPct / 2 : Math.max(0, rawPct - 10);
    }
    return rawPct / 2;
  }

  return rawPct / 2;
}

function buildHtml(rows: FlotaRow[], vehiculos: { m7: number; tdm: number }, fecha: string, logoSrc: string, clientsMap: Map<string, string> = new Map()): string {
  const m7Rows  = rows.filter(r => r.operator === 'M7');
  const tdmRows = rows.filter(r => r.operator === 'TDM');
  const totalM7  = m7Rows.reduce((s, r) => s + r.quantity, 0);
  const totalTDM = tdmRows.reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;
  const normClientForCount = (name: string) => (name || '').toUpperCase().includes('AJOVER') ? 'AJOVER' : (name || '').trim();
  const uniqueClients = new Set(rows.map(r => normClientForCount(r.client_name))).size;

  const m7Client = new Map<string, { shortName: string; fullName: string; propio: number; intermediacion: number; totalQty: number }>();
  m7Rows.forEach(r => {
    const sn = toShortClientName(r.client_name, clientsMap);
    const existing = m7Client.get(sn) || { shortName: sn, fullName: r.client_name, propio: 0, intermediacion: 0, totalQty: 0 };
    existing.propio += r.quantity;
    existing.totalQty += r.quantity;
    m7Client.set(sn, existing);
  });
  const m7ClientList = [...m7Client.values()].sort((a, b) => b.totalQty - a.totalQty);

  const tdmClient = new Map<string, { shortName: string; fullName: string; propio: number; intermediacion: number; totalQty: number }>();
  tdmRows.forEach(r => {
    const sn = toShortClientName(r.client_name, clientsMap);
    const existing = tdmClient.get(sn) || { shortName: sn, fullName: r.client_name, propio: 0, intermediacion: 0, totalQty: 0 };
    existing.intermediacion += r.quantity;
    existing.totalQty += r.quantity;
    tdmClient.set(sn, existing);
  });
  const tdmClientList = [...tdmClient.values()].sort((a, b) => b.totalQty - a.totalQty);

  interface ClientFinancialSummary {
    shortName: string;
    fullName: string;
    quantity: number;
    cxc: number;
    cxp: number;
    ingreso: number;
    rutaPct: number;
  }

  const clientFinancialMap = new Map<string, ClientFinancialSummary>();
  rows.forEach(r => {
    const sn = toShortClientName(r.client_name, clientsMap);
    const existing = clientFinancialMap.get(sn) || {
      shortName: sn,
      fullName: r.client_name,
      quantity: 0,
      cxc: 0,
      cxp: 0,
      ingreso: 0,
      rutaPct: 0,
    };
    existing.quantity += r.quantity;
    existing.cxc += r.cxc || 0;
    existing.cxp += r.cxp || 0;
    existing.ingreso = existing.cxc - existing.cxp;
    clientFinancialMap.set(sn, existing);
  });

  const clientList = [...clientFinancialMap.values()].map(item => {
    const isTdm = /^TDM\b/i.test(item.shortName) || item.fullName.toUpperCase().includes('TDM');
    const rawPct = item.cxc > 0 ? ((item.cxc - item.cxp) / item.cxc) * 100 : 0;
    const rutaPct = isTdm ? calcIntReal(rawPct, item.fullName) : rawPct;
    return { ...item, rutaPct: Math.round(rutaPct) };
  }).sort((a, b) => b.quantity - a.quantity);

  const grandTotalCxC = clientList.reduce((sum, c) => sum + c.cxc, 0);
  const grandTotalCxP = clientList.reduce((sum, c) => sum + c.cxp, 0);
  const grandTotalIngreso = grandTotalCxC - grandTotalCxP;
  const grandTotalRutaPct = grandTotalCxC > 0 ? Math.round(((grandTotalCxC - grandTotalCxP) / grandTotalCxC) * 100) : 0;

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

  const tablaRow = (item: ClientFinancialSummary) => `
    <tr>
      <td style="padding:2px 2px;text-align:center;color:#555;border-bottom:1px solid #e2e2e2;white-space:nowrap">${pct0(item.quantity, total)}%</td>
      <td style="padding:2px 2px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid #e2e2e2;color:#333;font-weight:700" title="${item.fullName}">${item.shortName}</td>
      <td style="padding:2px 2px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2;white-space:nowrap;color:#1a1a1a">${fmt(item.quantity)}</td>
      <td style="padding:2px 2px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2;white-space:nowrap;color:#1a1a1a">${item.rutaPct}%</td>
      <td style="padding:2px 2px;text-align:right;font-weight:700;border-bottom:1px solid #e2e2e2;white-space:nowrap;color:#1a1a1a">${fmtMoney(item.ingreso)}</td>
    </tr>`;

  const TABLA_IZQ = `
  <div style="font-size:14px;font-weight:900;text-align:center;color:#1a1a1a;margin-bottom:6px;padding-bottom:3px;border-bottom:2px solid #3CB44B;text-transform:uppercase">
    RESUMEN POR CLIENTE
  </div>
  <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:7.2px">
    <colgroup>
      <col style="width:28px">
      <col style="width:96px">
      <col style="width:34px">
      <col style="width:38px">
      <col style="width:84px">
    </colgroup>
    <thead>
      <tr style="background:#D9D9D9;color:#1a1a1a;font-weight:900;font-size:7.8px">
        <th style="padding:3.5px 2px;text-align:center">%</th>
        <th style="padding:3.5px 2px;text-align:left">CLIENTE</th>
        <th style="padding:3.5px 2px;text-align:right">TOTAL</th>
        <th style="padding:3.5px 2px;text-align:right">RUTA</th>
        <th style="padding:3.5px 2px;text-align:right">INGRESO</th>
      </tr>
    </thead>
    <tbody>
      ${clientList.map(item => tablaRow(item)).join('')}
      <tr style="background:#A9D18E;font-weight:900;font-size:7.5px;color:#14371e">
        <td style="padding:3.5px 2px;text-align:center;border-top:1.5px solid #82b463">100%</td>
        <td style="padding:3.5px 2px;text-align:left;border-top:1.5px solid #82b463">TOTAL GENERAL</td>
        <td style="padding:3.5px 2px;text-align:right;border-top:1.5px solid #82b463">${fmt(total)}</td>
        <td style="padding:3.5px 2px;text-align:right;border-top:1.5px solid #82b463">${grandTotalRutaPct}%</td>
        <td style="padding:3.5px 2px;text-align:right;border-top:1.5px solid #82b463">${fmtMoney(grandTotalIngreso)}</td>
      </tr>
    </tbody>
  </table>`;

  const barW = (n: number) => total > 0 ? (n / Math.max(totalM7, totalTDM, 1)) * 100 : 0;
  const OPERACIONES = `
  <div style="border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin-top:8px;background:#fff">
    <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:6px;text-align:center;text-transform:uppercase">OPERACIONES</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:75px;font-size:9px;font-weight:800;color:#1a1a1a">PROPIO: ${pct0(totalM7, total)}%</span>
        <div style="flex:1;height:14px;background:#eef0f2;border-radius:2px;overflow:hidden"><div style="height:100%;width:${barW(totalM7)}%;background:#8FAABE;min-width:2px"></div></div>
        <span style="width:28px;font-size:11px;font-weight:900;color:#1a1a1a;text-align:right">${fmt(totalM7)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:75px;font-size:9px;font-weight:800;color:#1a1a1a">ALIADO: ${pct0(totalTDM, total)}%</span>
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

  const m7PieItems: [string, number][] = m7ClientList.map(item => [item.shortName, item.totalQty]);
  const tdmPieItems: [string, number][] = tdmClientList.map(item => [item.shortName, item.totalQty]);

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
    ${flotaBlock('FLOTA PROPIA', m7PieItems, totalM7)}
    ${flotaBlock('FLOTA ALIADA', tdmPieItems, totalTDM)}
  </div>
</div>

<div style="border-top:1.5px solid #1a1a1a;margin-top:12px;padding-top:6px;display:flex;justify-content:flex-end;font-size:8px;color:#444">
  <span>Fecha: ${fecha} &nbsp;|&nbsp; Total: <strong style="color:#1a1a1a">${fmt(total)}</strong> viajes &nbsp;|&nbsp; Propio: <strong style="color:#1a1a1a">${fmt(totalM7)}</strong> &nbsp;Aliado: <strong style="color:#1a1a1a">${fmt(totalTDM)}</strong></span>
</div>

</body></html>`;
}

export async function generateFlotaReportPdf(fechaOverride?: string): Promise<{ base64: string; fileName: string; caption: string }> {
  const { from } = fechaOverride ? { from: fechaOverride } : yesterday();
  const [rows, vehiculos, clientsMap] = await Promise.all([
    queryFlota(from, from),
    queryVehiculos(from, from),
    fetchClientsMap(),
  ]);

  const totalM7  = rows.filter(r => r.operator === 'M7').reduce((s, r) => s + r.quantity, 0);
  const totalTDM = rows.filter(r => r.operator === 'TDM').reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;

  const logoSrc = getLogoBase64();
  const fechaLarga = formatFechaLarga(from);
  const html = buildHtml(rows, vehiculos, fechaLarga, logoSrc, clientsMap);

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
    const caption = `📊 *Informe Flota OrbitM7*\nFecha: ${from}\nTotal: ${total} (Propio: ${totalM7} | Aliado: ${totalTDM})`;
    return { base64, fileName, caption };
  } finally {
    await browser.close();
  }
}
