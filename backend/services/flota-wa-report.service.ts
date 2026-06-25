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
interface TdmSummary { total_manifiestos: number; total_cobrar: number; total_pagar: number; }
interface M7Summary { total_manifiestos: number; total_cobrar: number; total_pagar: number; }

const CITY_TO_DEPT: Record<string, string> = {
  'MEDELLIN':'ANTIOQUIA','ITAGUI':'ANTIOQUIA','ENVIGADO':'ANTIOQUIA','BELLO':'ANTIOQUIA','SABANETA':'ANTIOQUIA',
  'LA ESTRELLA':'ANTIOQUIA','COPACABANA':'ANTIOQUIA','GIRARDOTA':'ANTIOQUIA','CALDAS':'ANTIOQUIA','BARBOSA':'ANTIOQUIA',
  'RIONEGRO':'ANTIOQUIA','MARINILLA':'ANTIOQUIA','GUARNE':'ANTIOQUIA','CAUCASIA':'ANTIOQUIA','APARTADO':'ANTIOQUIA',
  'TURBO':'ANTIOQUIA','CAREPA':'ANTIOQUIA','CHIGORODO':'ANTIOQUIA','DON MATIAS':'ANTIOQUIA','YARUMAL':'ANTIOQUIA',
  'SANTA ROSA DE OSOS':'ANTIOQUIA','LA CEJA':'ANTIOQUIA','EL BAGRE':'ANTIOQUIA','SEGOVIA':'ANTIOQUIA',
  'REMEDIOS':'ANTIOQUIA','ZARAGOZA':'ANTIOQUIA','CACERES':'ANTIOQUIA','TARAZA':'ANTIOQUIA','NECHI':'ANTIOQUIA',
  'AMAGA':'ANTIOQUIA','FREDONIA':'ANTIOQUIA','ANDES':'ANTIOQUIA','URRAO':'ANTIOQUIA','DABEIBA':'ANTIOQUIA',
  'ANGOSTURA':'ANTIOQUIA','CAMPAMENTO':'ANTIOQUIA','VALDIVIA':'ANTIOQUIA','SOPETRAN':'ANTIOQUIA',
  'ABEJORRAL':'ANTIOQUIA','GRANADA':'ANTIOQUIA','SAN CARLOS':'ANTIOQUIA','SONSON':'ANTIOQUIA',
  'CALI':'VALLE DEL CAUCA','YUMBO':'VALLE DEL CAUCA','PALMIRA':'VALLE DEL CAUCA','BUENAVENTURA':'VALLE DEL CAUCA',
  'CARTAGO':'VALLE DEL CAUCA','JAMUNDI':'VALLE DEL CAUCA','TULUA':'VALLE DEL CAUCA','BUGA':'VALLE DEL CAUCA',
  'DAGUA':'VALLE DEL CAUCA','SEVILLA':'VALLE DEL CAUCA','ZARZAL':'VALLE DEL CAUCA','ROLDANILLO':'VALLE DEL CAUCA',
  'MONTERIA':'CORDOBA','VALENCIA':'CORDOBA','CERETE':'CORDOBA','LORICA':'CORDOBA','SAHAGUN':'CORDOBA',
  'PLANETA RICA':'CORDOBA','MONTELIBANO':'CORDOBA','TIERRALTA':'CORDOBA',
  'BOGOTA':'CUNDINAMARCA','BOGOTÁ':'CUNDINAMARCA','COTA':'CUNDINAMARCA','FUNZA':'CUNDINAMARCA',
  'MOSQUERA':'CUNDINAMARCA','MADRID':'CUNDINAMARCA','SOACHA':'CUNDINAMARCA','CHIA':'CUNDINAMARCA',
  'CAJICA':'CUNDINAMARCA','ZIPAQUIRA':'CUNDINAMARCA','TOCANCIPA':'CUNDINAMARCA','GIRARDOT':'CUNDINAMARCA',
  'BARRANQUILLA':'ATLANTICO','SOLEDAD':'ATLANTICO','MALAMBO':'ATLANTICO','GALAPA':'ATLANTICO',
  'CARTAGENA':'BOLIVAR','MAGANGUE':'BOLIVAR','ARJONA':'BOLIVAR','TURBACO':'BOLIVAR',
  'SANTA MARTA':'MAGDALENA','PLATO':'MAGDALENA','FUNDACION':'MAGDALENA','CIENAGA':'MAGDALENA',
  'SINCELEJO':'SUCRE','SAN MARCOS':'SUCRE','COROZAL':'SUCRE','SAMPUES':'SUCRE',
  'VALLEDUPAR':'CESAR','AGUACHICA':'CESAR','CODAZZI':'CESAR','CURUMANI':'CESAR',
  'PEREIRA':'RISARALDA','DOSQUEBRADAS':'RISARALDA','SANTA ROSA DE CABAL':'RISARALDA',
  'MANIZALES':'CALDAS','LA DORADA':'CALDAS','CHINCHINA':'CALDAS',
  'ARMENIA':'QUINDIO','CALARCA':'QUINDIO','MONTENEGRO':'QUINDIO',
  'IBAGUE':'TOLIMA','ESPINAL':'TOLIMA','MELGAR':'TOLIMA','FLANDES':'TOLIMA',
  'NEIVA':'HUILA','PITALITO':'HUILA','GARZON':'HUILA','GARZÓN':'HUILA',
  'VILLAVICENCIO':'META','ACACIAS':'META',
  'YOPAL':'CASANARE','AGUAZUL':'CASANARE',
  'BUCARAMANGA':'SANTANDER','FLORIDABLANCA':'SANTANDER','GIRON':'SANTANDER','PIEDECUESTA':'SANTANDER',
  'BARRANCABERMEJA':'SANTANDER','SAN GIL':'SANTANDER',
  'CUCUTA':'NORTE DE SANTANDER','CÚCUTA':'NORTE DE SANTANDER','OCAÑA':'NORTE DE SANTANDER',
  'POPAYAN':'CAUCA','POPAYÁN':'CAUCA','SANTANDER DE QUILICHAO':'CAUCA',
  'PASTO':'NARIÑO','IPIALES':'NARIÑO','TUMACO':'NARIÑO',
  'TUNJA':'BOYACA','SOGAMOSO':'BOYACA','DUITAMA':'BOYACA',
  'QUIBDO':'CHOCO','QUIBDÓ':'CHOCO',
  'RIOHACHA':'LA GUAJIRA','MAICAO':'LA GUAJIRA',
};

function getDept(city: string): string {
  return CITY_TO_DEPT[(city || '').toUpperCase().trim()] || city || 'SIN DEPTO.';
}

function yesterday(): { from: string; to: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const iso = d.toISOString().slice(0, 10);
  return { from: iso, to: iso };
}

async function queryFlota(from: string, to: string): Promise<FlotaRow[]> {
  const result = await pool.query(
    `WITH manifests AS (
        SELECT TRIM(client_name) AS client_name, 1 AS quantity,
               CASE WHEN UPPER(TRIM(client_name)) LIKE '%TDM%' THEN 'TDM' ELSE 'M7' END AS operator,
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

async function queryTdmSummary(from: string, to: string): Promise<TdmSummary> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total_manifiestos,
            COALESCE(SUM(valor_cobrar),0)::int AS total_cobrar,
            COALESCE(SUM(valor_pagar),0)::int AS total_pagar
     FROM flota_tdm_manifiestos WHERE fecha_operacion BETWEEN $1 AND $2`,
    [from, to]
  );
  return result.rows[0] || { total_manifiestos: 0, total_cobrar: 0, total_pagar: 0 };
}

async function queryM7Summary(from: string, to: string): Promise<M7Summary> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total_manifiestos,
            COALESCE(SUM(total_value_cxc_final),0)::bigint AS total_cobrar,
            COALESCE(SUM(total_value_cxp_final),0)::bigint AS total_pagar
     FROM management_orders
     WHERE manifest_date::date BETWEEN $1 AND $2
       AND manifest_status NOT IN ('ANULADO','CANCELADO','ANULADA')
       AND manifest_date IS NOT NULL
       AND UPPER(TRIM(client_name)) NOT LIKE '%TDM%'`,
    [from, to]
  );
  return result.rows[0] || { total_manifiestos: 0, total_cobrar: 0, total_pagar: 0 };
}

const fmt = (n: number) => n.toLocaleString('es-CO');
const pct = (n: number, t: number) => t > 0 ? ((n / t) * 100).toFixed(1) + '%' : '0%';

function hBars(items: [string, number][], total: number, color: string, maxLabel = 28): string {
  if (!items.length) return '<p style="color:#80a0a0;font-size:9px;padding:8px">Sin datos</p>';
  const maxVal = Math.max(...items.map(x => x[1]), 1);
  return items.map(([name, qty]) => {
    const w = (qty / maxVal) * 100;
    const wStr = w.toFixed(1);
    const label = name.length > maxLabel ? name.slice(0, maxLabel) + '…' : name;
    // Si la barra ocupa >38% → texto blanco dentro; si no → texto oscuro justo después
    const txtColor  = w > 38 ? '#fff' : '#0a3535';
    const txtLeft   = w > 38 ? '5px' : `calc(${wStr}% + 5px)`;
    return `<div style="display:flex;align-items:center;margin-bottom:3px;gap:6px">
      <div style="width:120px;font-size:7.5px;text-align:right;color:#2a5555;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${label}</div>
      <div style="flex:1;background:#ddf0f0;border-radius:3px;height:14px;position:relative">
        <div style="position:absolute;left:0;top:0;width:${wStr}%;height:100%;background:${color};border-radius:3px;min-width:3px"></div>
        <span style="position:absolute;left:${txtLeft};top:50%;transform:translateY(-50%);font-size:7px;font-weight:700;color:${txtColor};white-space:nowrap">${qty} (${pct(qty, total)})</span>
      </div>
    </div>`;
  }).join('');
}

function buildHtml(rows: FlotaRow[], tdm: TdmSummary, m7sum: M7Summary, fecha: string, logoSrc: string): string {
  // Agregados
  const m7Rows  = rows.filter(r => r.operator === 'M7');
  const tdmRows = rows.filter(r => r.operator === 'TDM');
  const totalM7  = m7Rows.reduce((s, r) => s + r.quantity, 0);
  const totalTDM = tdmRows.reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;
  const uniqueClients = new Set(rows.map(r => r.client_name)).size;

  // M7 por cliente
  const m7Client = new Map<string, number>();
  m7Rows.forEach(r => m7Client.set(r.client_name, (m7Client.get(r.client_name) || 0) + r.quantity));
  const m7ClientList = [...m7Client.entries()].sort((a, b) => b[1] - a[1]);

  // TDM por cliente
  const tdmClient = new Map<string, number>();
  tdmRows.forEach(r => tdmClient.set(r.client_name, (tdmClient.get(r.client_name) || 0) + r.quantity));
  const tdmClientList = [...tdmClient.entries()].sort((a, b) => b[1] - a[1]);

  // M7 por departamento
  const m7Dept = new Map<string, number>();
  m7Rows.forEach(r => { const d = getDept(r.city); m7Dept.set(d, (m7Dept.get(d) || 0) + r.quantity); });
  const m7DeptList = [...m7Dept.entries()].sort((a, b) => b[1] - a[1]);

  // TDM por departamento
  const tdmDept = new Map<string, number>();
  tdmRows.forEach(r => { const d = getDept(r.city); tdmDept.set(d, (tdmDept.get(d) || 0) + r.quantity); });
  const tdmDeptList = [...tdmDept.entries()].sort((a, b) => b[1] - a[1]);

  // Tabla completa: todos los clientes
  const allClients = new Map<string, { q: number; op: string; depts: Map<string, number> }>();
  rows.forEach(r => {
    const cur = allClients.get(r.client_name);
    const dept = getDept(r.city);
    if (!cur) {
      const dm = new Map<string, number>(); dm.set(dept, r.quantity);
      allClients.set(r.client_name, { q: r.quantity, op: r.operator, depts: dm });
    } else {
      cur.q += r.quantity;
      cur.depts.set(dept, (cur.depts.get(dept) || 0) + r.quantity);
    }
  });
  const allClientList = [...allClients.entries()].sort((a, b) => b[1].q - a[1].q);

  const tableRows = allClientList.map(([name, { q, op, depts }], i) => {
    const topDept = [...depts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${name.slice(0, 40)}</td>
      <td class="op-${op.toLowerCase()}">${op}</td>
      <td class="num">${q}</td>
      <td class="num pctc">${pct(q, total)}</td>
      <td>${topDept}</td>
    </tr>`;
  }).join('');

  const HEADER = `
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:12px">
      ${logoSrc ? `<img src="${logoSrc}" style="height:36px;object-fit:contain;filter:brightness(0) invert(1)" alt="logo">` : ''}
      <div>
        <div style="font-size:15px;font-weight:900;letter-spacing:-.3px">OrbitM7 — Informe Flota</div>
        <div style="font-size:8.5px;color:#a0c4ff;margin-top:1px">Fecha: ${fecha} &nbsp;|&nbsp; Generado automáticamente</div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,.12);padding:5px 14px;border-radius:18px;font-size:9.5px;font-weight:700;color:#7fdbff">MILLA SIE7E</div>
  </div>`;

  const fmtK = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}K` : `$${fmt(n)}`;
  const KPIS = `
  <div class="kpis">
    <div class="kpi" style="background:linear-gradient(135deg,#4f46e5,#6366f1)"><div class="kv">${fmt(total)}</div><div class="kt">Total Viajes</div></div>
    <div class="kpi" style="background:linear-gradient(135deg,#059669,#10b981)"><div class="kv">${fmt(totalM7)}</div><div class="kt">Viajes M7</div></div>
    <div class="kpi" style="background:linear-gradient(135deg,#d97706,#f59e0b)"><div class="kv">${fmt(totalTDM)}</div><div class="kt">Viajes TDM</div></div>
    <div class="kpi" style="background:linear-gradient(135deg,#0891b2,#06b6d4)"><div class="kv">${uniqueClients}</div><div class="kt">Clientes</div></div>
    ${m7sum.total_cobrar > 0 ? `
    <div class="kpi" style="background:linear-gradient(135deg,#065f46,#059669)"><div class="kv">${fmtK(m7sum.total_cobrar)}</div><div class="kt">M7 Cobrar</div></div>
    <div class="kpi" style="background:linear-gradient(135deg,#1e3a8a,#2563eb)"><div class="kv">${fmtK(m7sum.total_pagar)}</div><div class="kt">M7 Pagar</div></div>` : ''}
    ${tdm.total_manifiestos > 0 ? `
    <div class="kpi" style="background:linear-gradient(135deg,#92400e,#b45309)"><div class="kv">${fmtK(tdm.total_cobrar)}</div><div class="kt">TDM Cobrar</div></div>
    <div class="kpi" style="background:linear-gradient(135deg,#9f1239,#e11d48)"><div class="kv">${fmtK(tdm.total_pagar)}</div><div class="kt">TDM Pagar</div></div>` : ''}
  </div>`;

  // Tabla M7 por cliente (página 1)
  const m7ClientTableRows = m7ClientList.map(([name, q], i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${name.slice(0, 40)}</td>
      <td class="num">${q}</td>
      <td class="num pctc">${pct(q, totalM7)}</td>
    </tr>`).join('');

  // Tabla TDM por cliente (página 1)
  const tdmClientTableRows = tdmClientList.map(([name, q], i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${name.replace(/^TDM\s*/i, '').slice(0, 40)}</td>
      <td class="num">${q}</td>
      <td class="num pctc">${pct(q, totalTDM)}</td>
    </tr>`).join('');

  // Tabla M7 por departamento: cliente + cant + dpto principal + % (página 2)
  const m7DeptTableRows = m7ClientList.map(([name, q], i) => {
    const topDept = [...(allClients.get(name)?.depts.entries() || [])].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${name.slice(0, 36)}</td>
      <td class="num">${q}</td>
      <td>${topDept}</td>
      <td class="num pctc">${pct(q, totalM7)}</td>
    </tr>`;
  }).join('');

  // Tabla TDM por departamento: cliente + cant + dpto principal + % (página 2)
  const tdmDeptTableRows = tdmClientList.map(([name, q], i) => {
    const topDept = [...(allClients.get(name)?.depts.entries() || [])].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${name.replace(/^TDM\s*/i, '').slice(0, 36)}</td>
      <td class="num">${q}</td>
      <td>${topDept}</td>
      <td class="num pctc">${pct(q, totalTDM)}</td>
    </tr>`;
  }).join('');

  // Variables para barras comparativas
  const totalCli = m7ClientList.length + tdmClientList.length || 1;
  const m7CliH   = Math.round((m7ClientList.length / Math.max(m7ClientList.length, tdmClientList.length, 1)) * 56);
  const tdmCliH  = Math.max(Math.round((tdmClientList.length / Math.max(m7ClientList.length, tdmClientList.length, 1)) * 56), 4);
  const m7ViaH   = Math.round((totalM7 / Math.max(totalM7, totalTDM, 1)) * 56);
  const tdmViaH  = Math.max(Math.round((totalTDM / Math.max(totalM7, totalTDM, 1)) * 56), 4);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
/* ── Paleta corporativa Milla 7 ── */
:root{--pri:#0a3535;--acc:#00b4b4;--acc2:#007a7a;--acc3:#00d4d4;--bg:#f0fafa;--wh:#fff;--txt:#0a3535;--m7c:#00b4b4;--tdmc:#e67e00}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:var(--txt);background:var(--wh);width:794px}
.hdr{background:linear-gradient(135deg,var(--pri) 0%,#0f4a4a 100%);color:var(--wh);padding:10px 20px;display:flex;align-items:center;justify-content:space-between}
.kpis{display:flex;flex-wrap:wrap;gap:5px;padding:6px 20px 4px;background:var(--bg)}
.kpi{flex:1;min-width:72px;border-radius:7px;padding:6px 9px;color:var(--wh)}
.kv{font-size:14px;font-weight:900;line-height:1}
.kt{font-size:6px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;opacity:.9}
.sec{font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--acc2);border-bottom:2px solid var(--acc);padding-bottom:2px;margin-bottom:4px}
.g2{display:flex;gap:12px;padding:5px 20px}
.col{flex:1;min-width:0}
.pb{page-break-before:always}
table{width:100%;border-collapse:collapse;font-size:7.5px}
thead tr{background:var(--pri);color:var(--wh)}
thead th{padding:3px 5px;text-align:left;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.2px}
tbody tr.ev{background:#e8f7f7}
tbody td{padding:2.5px 5px;border-bottom:1px solid #cce8e8;color:var(--txt)}
.num{text-align:right;font-weight:600}.pct{color:#4a7a7a;font-size:7px}
.m7{color:var(--m7c);font-weight:800}.tdm{color:var(--tdmc);font-weight:800}
.total-row{background:#c2eaea!important;font-weight:800}
.ftr{background:var(--pri);color:#80d4d4;font-size:7.5px;padding:5px 20px;display:flex;justify-content:space-between}
.ftr strong{color:var(--acc3)}
</style></head><body>

<!-- ══════════ PÁGINA 1: Clientes ══════════ -->
${HEADER}
${KPIS}

<!-- ── Comparativo M7 vs TDM ── -->
<div style="padding:5px 20px 3px;background:var(--bg)">
  <div class="sec">📊 Comparativo M7 vs TDM — Clientes y Viajes</div>
  <div style="display:flex;gap:16px;align-items:flex-start;margin-top:5px">

    <!-- Gráfica: Cantidad de Clientes -->
    <div style="flex:1;text-align:center">
      <div style="font-size:7px;font-weight:700;text-transform:uppercase;color:var(--acc2);margin-bottom:4px;letter-spacing:.5px">Cantidad de Clientes</div>
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:22px;height:80px;border-bottom:1.5px solid #99cccc;padding-bottom:0">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
          <span style="font-size:9px;font-weight:900;color:var(--m7c)">${m7ClientList.length}</span>
          <span style="font-size:7.5px;font-weight:700;color:var(--acc2)">${pct(m7ClientList.length, totalCli)}</span>
          <div style="width:42px;height:${m7CliH}px;background:linear-gradient(180deg,var(--acc3),var(--acc2));border-radius:4px 4px 0 0"></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
          <span style="font-size:9px;font-weight:900;color:var(--tdmc)">${tdmClientList.length}</span>
          <span style="font-size:7.5px;font-weight:700;color:#b36000">${pct(tdmClientList.length, totalCli)}</span>
          <div style="width:42px;height:${tdmCliH}px;background:linear-gradient(180deg,#f5a623,#b36000);border-radius:4px 4px 0 0"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:22px;margin-top:3px">
        <span style="font-size:7px;font-weight:700;color:var(--m7c);width:42px;text-align:center">Milla 7</span>
        <span style="font-size:7px;font-weight:700;color:var(--tdmc);width:42px;text-align:center">TDM</span>
      </div>
    </div>

    <!-- Gráfica: Cantidad de Viajes -->
    <div style="flex:1;text-align:center">
      <div style="font-size:7px;font-weight:700;text-transform:uppercase;color:var(--acc2);margin-bottom:4px;letter-spacing:.5px">Cantidad de Viajes</div>
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:22px;height:80px;border-bottom:1.5px solid #99cccc;padding-bottom:0">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
          <span style="font-size:9px;font-weight:900;color:var(--m7c)">${fmt(totalM7)}</span>
          <span style="font-size:7.5px;font-weight:700;color:var(--acc2)">${pct(totalM7, total)}</span>
          <div style="width:42px;height:${m7ViaH}px;background:linear-gradient(180deg,var(--acc3),var(--acc2));border-radius:4px 4px 0 0"></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
          <span style="font-size:9px;font-weight:900;color:var(--tdmc)">${fmt(totalTDM)}</span>
          <span style="font-size:7.5px;font-weight:700;color:#b36000">${pct(totalTDM, total)}</span>
          <div style="width:42px;height:${tdmViaH}px;background:linear-gradient(180deg,#f5a623,#b36000);border-radius:4px 4px 0 0"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:22px;margin-top:3px">
        <span style="font-size:7px;font-weight:700;color:var(--m7c);width:42px;text-align:center">Milla 7</span>
        <span style="font-size:7px;font-weight:700;color:var(--tdmc);width:42px;text-align:center">TDM</span>
      </div>
    </div>

    <!-- Tabla comparativa -->
    <div style="flex:1.8">
      <table>
        <thead><tr><th>Operador</th><th>Clientes</th><th>% Cli.</th><th>Viajes</th><th>% Viaj.</th></tr></thead>
        <tbody>
          <tr class="ev">
            <td class="m7">Milla 7</td>
            <td class="num">${m7ClientList.length}</td>
            <td class="num pct">${pct(m7ClientList.length, totalCli)}</td>
            <td class="num">${fmt(totalM7)}</td>
            <td class="num pct">${pct(totalM7, total)}</td>
          </tr>
          <tr>
            <td class="tdm">TDM</td>
            <td class="num">${tdmClientList.length}</td>
            <td class="num pct">${pct(tdmClientList.length, totalCli)}</td>
            <td class="num">${fmt(totalTDM)}</td>
            <td class="num pct">${pct(totalTDM, total)}</td>
          </tr>
          <tr class="total-row">
            <td style="font-weight:800">TOTAL</td>
            <td class="num">${m7ClientList.length + tdmClientList.length}</td>
            <td class="num">100%</td>
            <td class="num">${fmt(total)}</td>
            <td class="num">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Gráficas por cliente -->
<div class="g2">
  <div class="col">
    <div class="sec">🏢 M7 — Por Cliente (${m7ClientList.length})</div>
    ${hBars(m7ClientList, totalM7, 'linear-gradient(90deg,var(--acc3),var(--acc2))')}
  </div>
  <div class="col">
    <div class="sec">⭐ TDM — Por Cliente (${tdmClientList.length})</div>
    ${tdmClientList.length ? hBars(tdmClientList, totalTDM, 'linear-gradient(90deg,#f5a623,#b36000)') : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
</div>

<!-- Tablas por cliente -->
<div class="g2" style="align-items:flex-start">
  <div class="col">
    <div class="sec">📋 M7 — Detalle Clientes</div>
    <table>
      <thead><tr><th>Cliente</th><th>Cant.</th><th>%</th></tr></thead>
      <tbody>${m7ClientTableRows}</tbody>
    </table>
  </div>
  <div class="col">
    <div class="sec">📋 TDM — Detalle Clientes</div>
    ${tdmClientList.length ? `<table>
      <thead><tr><th>Cliente</th><th>Cant.</th><th>%</th></tr></thead>
      <tbody>${tdmClientTableRows}</tbody>
    </table>` : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
</div>

<div class="ftr">
  <span><strong>OrbitM7</strong> — Milla 7 S.A.S. &nbsp;|&nbsp; Página 1 de 2</span>
  <span>Total: <strong>${fmt(total)}</strong> &nbsp;M7: <strong>${fmt(totalM7)}</strong> &nbsp;TDM: <strong>${fmt(totalTDM)}</strong></span>
</div>

<!-- ══════════ PÁGINA 2: Departamentos ══════════ -->
<div class="pb"></div>
${HEADER}

<!-- Gráficas por departamento -->
<div class="g2">
  <div class="col">
    <div class="sec">📍 M7 — Por Departamento (${m7DeptList.length})</div>
    ${hBars(m7DeptList, totalM7, 'linear-gradient(90deg,var(--acc3),var(--acc2))')}
  </div>
  <div class="col">
    <div class="sec">📍 TDM — Por Departamento (${tdmDeptList.length})</div>
    ${tdmDeptList.length ? hBars(tdmDeptList, totalTDM, 'linear-gradient(90deg,#f5a623,#b36000)') : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
</div>

<!-- Tablas: cliente + departamento -->
<div class="g2" style="align-items:flex-start">
  <div class="col">
    <div class="sec">📍 M7 — Cliente por Departamento</div>
    <table>
      <thead><tr><th>Cliente</th><th>Cant.</th><th>Departamento</th><th>%</th></tr></thead>
      <tbody>${m7DeptTableRows}</tbody>
    </table>
  </div>
  <div class="col">
    <div class="sec">📍 TDM — Cliente por Departamento</div>
    ${tdmClientList.length ? `<table>
      <thead><tr><th>Cliente</th><th>Cant.</th><th>Departamento</th><th>%</th></tr></thead>
      <tbody>${tdmDeptTableRows}</tbody>
    </table>` : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
</div>

<div class="ftr" style="margin-top:8px">
  <span><strong>OrbitM7</strong> — Milla 7 S.A.S. &nbsp;|&nbsp; Página 2 de 2</span>
  <span>Fecha: ${fecha} &nbsp;|&nbsp; Total: <strong>${fmt(total)}</strong> viajes</span>
</div>

</body></html>`;
}

export async function generateFlotaReportPdf(fechaOverride?: string): Promise<{ base64: string; fileName: string; caption: string }> {
  const { from } = fechaOverride ? { from: fechaOverride } : yesterday();
  const [rows, tdm, m7sum] = await Promise.all([
    queryFlota(from, from),
    queryTdmSummary(from, from),
    queryM7Summary(from, from),
  ]);

  const totalM7  = rows.filter(r => r.operator === 'M7').reduce((s, r) => s + r.quantity, 0);
  const totalTDM = rows.filter(r => r.operator === 'TDM').reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;

  const logoSrc = getLogoBase64();
  const html = buildHtml(rows, tdm, m7sum, from, logoSrc);

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
