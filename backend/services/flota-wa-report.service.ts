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
  // Obtener la fecha actual en Colombia (UTC-5) para evitar el desfase de zona horaria.
  // Si el cron dispara a las 7 PM Colombia, en UTC ya es medianoche del día siguiente.
  const bogotaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [y, m, d] = bogotaHoy.split('-').map(Number);
  const ayer = new Date(y, m - 1, d - 1);
  const iso = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
  return { from: iso, to: iso };
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
  const m7Rows  = rows.filter(r => r.operator === 'M7');
  const tdmRows = rows.filter(r => r.operator === 'TDM');
  const totalM7  = m7Rows.reduce((s, r) => s + r.quantity, 0);
  const totalTDM = tdmRows.reduce((s, r) => s + r.quantity, 0);
  const total    = totalM7 + totalTDM;

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

  const uniqueClients = new Set(rows.map(r => r.client_name)).size;

  // Intermediaciones como porcentaje de margen: (cobrar - pagar) / cobrar × 100
  const m7IntPct       = m7sum.total_cobrar > 0 ? (m7sum.total_cobrar - m7sum.total_pagar) / m7sum.total_cobrar * 100 : 0;
  const tdmIntTotalPct = tdm.total_cobrar   > 0 ? (tdm.total_cobrar   - tdm.total_pagar)   / tdm.total_cobrar   * 100 : 0;
  // TDM Real: si Total >= 20 → Total/2; si Total < 20 → Total - 10
  const tdmIntRealPct = tdmIntTotalPct >= 20
    ? tdmIntTotalPct / 2
    : Math.max(0, tdmIntTotalPct - 10);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  // Barras comparativas (altura proporcional, mín 4px)
  const totalCli = m7ClientList.length + tdmClientList.length || 1;
  const m7CliH  = Math.round((m7ClientList.length / Math.max(m7ClientList.length, tdmClientList.length, 1)) * 60);
  const tdmCliH = Math.max(Math.round((tdmClientList.length / Math.max(m7ClientList.length, tdmClientList.length, 1)) * 60), 4);
  const m7ViaH  = Math.round((totalM7 / Math.max(totalM7, totalTDM, 1)) * 60);
  const tdmViaH = Math.max(Math.round((totalTDM / Math.max(totalM7, totalTDM, 1)) * 60), 4);

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

  // Fila 1: viajes y clientes | Fila 2: intermediaciones
  const KPIS = `
  <div style="background:var(--bg);padding:5px 20px 0">
    <div style="display:flex;gap:4px;margin-bottom:4px">
      <div class="kpi" style="background:linear-gradient(135deg,#4f46e5,#6366f1)"><div class="kv">${fmt(total)}</div><div class="kt">Total Viajes</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#059669,#10b981)"><div class="kv">${fmt(totalM7)}</div><div class="kt">Viajes M7</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#d97706,#f59e0b)"><div class="kv">${fmt(totalTDM)}</div><div class="kt">Viajes TDM</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#0f766e,#14b8a6)"><div class="kv">${uniqueClients}</div><div class="kt">Total Clientes</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#0891b2,#06b6d4)"><div class="kv">${m7ClientList.length}</div><div class="kt">M7 Clientes</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#92400e,#b45309)"><div class="kv">${tdmClientList.length}</div><div class="kt">TDM Clientes</div></div>
    </div>
    <div style="display:flex;gap:4px;padding-bottom:5px">
      <div class="kpi" style="background:linear-gradient(135deg,#065f46,#059669)"><div class="kv">${fmtPct(m7IntPct)}</div><div class="kt">M7 Intermediación</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#6d28d9,#7c3aed)"><div class="kv">${fmtPct(tdmIntTotalPct)}</div><div class="kt">TDM Intermed. Total</div></div>
      <div class="kpi" style="background:linear-gradient(135deg,#9f1239,#e11d48)"><div class="kv">${fmtPct(tdmIntRealPct)}</div><div class="kt">TDM Intermed. Real</div></div>
    </div>
  </div>`;

  // Gráfica comparativa M7 vs TDM
  const COMPARATIVO = `
  <div style="padding:4px 20px 3px;background:var(--bg)">
    <div class="sec">📊 Comparativo M7 vs TDM</div>
    <div style="display:flex;gap:20px;align-items:flex-start;margin-top:4px">
      <!-- Clientes -->
      <div style="flex:1;text-align:center">
        <div style="font-size:7px;font-weight:700;color:var(--acc2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Clientes</div>
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:18px;height:72px;border-bottom:1.5px solid #99cccc">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
            <span style="font-size:9px;font-weight:900;color:var(--m7c)">${m7ClientList.length}</span>
            <span style="font-size:6.5px;font-weight:700;color:var(--acc2)">${pct(m7ClientList.length, totalCli)}</span>
            <div style="width:38px;height:${m7CliH}px;background:linear-gradient(180deg,var(--acc3),var(--acc2));border-radius:4px 4px 0 0"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
            <span style="font-size:9px;font-weight:900;color:var(--tdmc)">${tdmClientList.length}</span>
            <span style="font-size:6.5px;font-weight:700;color:#b36000">${pct(tdmClientList.length, totalCli)}</span>
            <div style="width:38px;height:${tdmCliH}px;background:linear-gradient(180deg,#f5a623,#b36000);border-radius:4px 4px 0 0"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;gap:18px;margin-top:3px">
          <span style="font-size:6.5px;font-weight:700;color:var(--m7c);width:38px;text-align:center">M7</span>
          <span style="font-size:6.5px;font-weight:700;color:var(--tdmc);width:38px;text-align:center">TDM</span>
        </div>
      </div>
      <!-- Viajes -->
      <div style="flex:1;text-align:center">
        <div style="font-size:7px;font-weight:700;color:var(--acc2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">Viajes</div>
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:18px;height:72px;border-bottom:1.5px solid #99cccc">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
            <span style="font-size:9px;font-weight:900;color:var(--m7c)">${fmt(totalM7)}</span>
            <span style="font-size:6.5px;font-weight:700;color:var(--acc2)">${pct(totalM7, total)}</span>
            <div style="width:38px;height:${m7ViaH}px;background:linear-gradient(180deg,var(--acc3),var(--acc2));border-radius:4px 4px 0 0"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;height:100%">
            <span style="font-size:9px;font-weight:900;color:var(--tdmc)">${fmt(totalTDM)}</span>
            <span style="font-size:6.5px;font-weight:700;color:#b36000">${pct(totalTDM, total)}</span>
            <div style="width:38px;height:${tdmViaH}px;background:linear-gradient(180deg,#f5a623,#b36000);border-radius:4px 4px 0 0"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;gap:18px;margin-top:3px">
          <span style="font-size:6.5px;font-weight:700;color:var(--m7c);width:38px;text-align:center">M7</span>
          <span style="font-size:6.5px;font-weight:700;color:var(--tdmc);width:38px;text-align:center">TDM</span>
        </div>
      </div>
      <!-- Tabla resumen -->
      <div style="flex:2;font-size:8px">
        <table style="width:100%;border-collapse:collapse;font-size:7.5px">
          <thead><tr style="background:var(--pri);color:#fff">
            <th style="padding:3px 5px;text-align:left">Operador</th>
            <th style="padding:3px 5px;text-align:right">Clientes</th>
            <th style="padding:3px 5px;text-align:right">% Cli.</th>
            <th style="padding:3px 5px;text-align:right">Viajes</th>
            <th style="padding:3px 5px;text-align:right">% Viaj.</th>
          </tr></thead>
          <tbody>
            <tr style="background:#e8f7f7">
              <td style="padding:2.5px 5px;color:var(--m7c);font-weight:800">Milla 7</td>
              <td style="padding:2.5px 5px;text-align:right">${m7ClientList.length}</td>
              <td style="padding:2.5px 5px;text-align:right;color:#4a7a7a">${pct(m7ClientList.length, totalCli)}</td>
              <td style="padding:2.5px 5px;text-align:right">${fmt(totalM7)}</td>
              <td style="padding:2.5px 5px;text-align:right;color:#4a7a7a">${pct(totalM7, total)}</td>
            </tr>
            <tr>
              <td style="padding:2.5px 5px;color:var(--tdmc);font-weight:800">TDM</td>
              <td style="padding:2.5px 5px;text-align:right">${tdmClientList.length}</td>
              <td style="padding:2.5px 5px;text-align:right;color:#4a7a7a">${pct(tdmClientList.length, totalCli)}</td>
              <td style="padding:2.5px 5px;text-align:right">${fmt(totalTDM)}</td>
              <td style="padding:2.5px 5px;text-align:right;color:#4a7a7a">${pct(totalTDM, total)}</td>
            </tr>
            <tr style="background:#c2eaea;font-weight:800">
              <td style="padding:2.5px 5px">TOTAL</td>
              <td style="padding:2.5px 5px;text-align:right">${uniqueClients}</td>
              <td style="padding:2.5px 5px;text-align:right">100%</td>
              <td style="padding:2.5px 5px;text-align:right">${fmt(total)}</td>
              <td style="padding:2.5px 5px;text-align:right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`;

  const m7ClientChart  = m7ClientList;
  const tdmClientChart = tdmClientList;
  const m7DeptChart    = m7DeptList;
  const tdmDeptChart   = tdmDeptList;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
:root{--pri:#0a3535;--acc:#00b4b4;--acc2:#007a7a;--acc3:#00d4d4;--bg:#f0fafa;--wh:#fff;--txt:#0a3535;--m7c:#00b4b4;--tdmc:#e67e00}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:var(--txt);background:var(--wh);width:794px}
.hdr{background:linear-gradient(135deg,var(--pri) 0%,#0f4a4a 100%);color:var(--wh);padding:10px 20px;display:flex;align-items:center;justify-content:space-between}
.kpi{flex:1;border-radius:6px;padding:5px 7px;color:var(--wh)}
.kv{font-size:12px;font-weight:900;line-height:1}
.kt{font-size:5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-top:2px;opacity:.9}
.sec{font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--acc2);border-bottom:2px solid var(--acc);padding-bottom:2px;margin-bottom:4px}
.charts{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:5px 10px;padding:5px 20px;align-content:start}
.chart-cell{min-width:0;overflow:hidden}
.ftr{background:var(--pri);color:#80d4d4;font-size:7.5px;padding:5px 20px;display:flex;justify-content:space-between}
.ftr strong{color:var(--acc3)}
</style></head><body>

${HEADER}
${KPIS}
${COMPARATIVO}

<!-- 4 gráficas en cuadrícula 2×2 -->
<div class="charts">
  <div class="chart-cell">
    <div class="sec">🏢 M7 — Por Cliente (${m7ClientList.length})</div>
    ${hBars(m7ClientChart, totalM7, 'linear-gradient(90deg,var(--acc3),var(--acc2))')}
  </div>
  <div class="chart-cell">
    <div class="sec">⭐ TDM — Por Cliente (${tdmClientList.length})</div>
    ${tdmClientList.length ? hBars(tdmClientChart, totalTDM, 'linear-gradient(90deg,#f5a623,#b36000)') : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
  <div class="chart-cell">
    <div class="sec">📍 M7 — Por Departamento (${m7DeptList.length})</div>
    ${hBars(m7DeptChart, totalM7, 'linear-gradient(90deg,var(--acc3),var(--acc2))')}
  </div>
  <div class="chart-cell">
    <div class="sec">📍 TDM — Por Departamento (${tdmDeptList.length})</div>
    ${tdmDeptList.length ? hBars(tdmDeptChart, totalTDM, 'linear-gradient(90deg,#f5a623,#b36000)') : '<p style="color:#80a0a0;font-size:9px;padding:6px 0">Sin datos TDM</p>'}
  </div>
</div>

<div class="ftr">
  <span><strong>OrbitM7</strong> — Milla 7 S.A.S.</span>
  <span>Fecha: ${fecha} &nbsp;|&nbsp; Total: <strong>${fmt(total)}</strong> viajes &nbsp;|&nbsp; M7: <strong>${fmt(totalM7)}</strong> &nbsp;TDM: <strong>${fmt(totalTDM)}</strong></span>
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
