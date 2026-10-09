import pool from '../config/database.js';
import puppeteer from 'puppeteer';
import XLSX from 'xlsx';
import { toShortClientName } from './flota-wa-report.service.js';

export interface PreoperacionalClientStat {
  clientRaw: string;
  shortName: string;
  totalOrders: number;
  realizados: number;
  aptos: number;
  noAptos: number;
  pendientes: number;
  efectividadPct: number;
}

export interface PreoperacionalOrderDetail {
  oc_number: string;
  manifest_number: string;
  client_name: string;
  short_client: string;
  plate: string;
  driver_name: string;
  driver_document: string;
  estado: string; // 'Apto', 'No apto', 'Pendiente'
  firmado: string;
  fecha: string;
}

export interface PreoperacionalReportResult {
  fecha: string;
  fechaFormateada: string;
  totalOrders: number;
  totalRealizados: number;
  totalAptos: number;
  totalNoAptos: number;
  totalPendientes: number;
  efectividadGlobal: number;
  clientStats: PreoperacionalClientStat[];
  realizadosList: PreoperacionalOrderDetail[];
  pendientesList: PreoperacionalOrderDetail[];
  message: string;
  pdfBase64: string;
  pdfFileName: string;
  excelBuffer: Buffer;
  excelFileName: string;
}

function getYesterdayIso(): string {
  const bogotaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [y, m, d] = bogotaHoy.split('-').map(Number);
  const ayer = new Date(y, m - 1, d - 1);
  return `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
}

async function fetchClientsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await pool.query("SELECT name, short_name FROM clients WHERE short_name IS NOT NULL AND TRIM(short_name) <> ''");
    for (const r of res.rows) {
      if (r.name && r.short_name) {
        map.set(r.name.trim().toUpperCase(), r.short_name.trim());
      }
    }
  } catch (e) {
    console.warn('[PREOP-REPORT] Error fetching clientsMap:', e);
  }
  return map;
}

export async function generatePreoperacionalReport(fechaOverride?: string): Promise<PreoperacionalReportResult> {
  const fecha = fechaOverride || getYesterdayIso();
  const clientsMap = await fetchClientsMap();

  // 1. Consultar manifiestos / órdenes de cargue para la fecha dada en management_orders
  const ordersRes = await pool.query(`
    SELECT oc_number, manifest_number, client_name, plate, manifest_date
    FROM management_orders
    WHERE manifest_date::date = $1
      AND manifest_status NOT IN ('ANULADO', 'CANCELADO', 'ANULADA')
      AND oc_number IS NOT NULL AND TRIM(oc_number) <> ''
  `, [fecha]);
  // 2. Consultar respuestas de preoperacional registradas en preoperacional_respuestas para esa fecha
  const preopRes = await pool.query(`
    SELECT oc_number, id_orden, manifest_number, id_manifest, driver_name, driver_document, plate, estado, firmado, fecha
    FROM preoperacional_respuestas
    WHERE fecha = $1
  `, [fecha]);

  // Consultar historial de conductores por placa como fallback para órdenes pendientes
  const driverPlateRes = await pool.query(`
    SELECT DISTINCT ON (UPPER(TRIM(plate))) 
      UPPER(TRIM(plate)) as plate, driver_name, driver_document
    FROM preoperacional_respuestas
    WHERE driver_name IS NOT NULL AND TRIM(driver_name) <> '' AND driver_name NOT ILIKE '%SIN REGISTRO%'
    ORDER BY UPPER(TRIM(plate)), updated_at DESC
  `);
  const driverByPlateMap = new Map<string, { driver_name: string; driver_document: string }>();
  for (const d of driverPlateRes.rows) {
    if (d.plate) {
      driverByPlateMap.set(d.plate, {
        driver_name: d.driver_name,
        driver_document: d.driver_document || 'S/I'
      });
    }
  }

  const normOc = (oc: string) => (oc || '').trim().toUpperCase().replace(/^OC[-_\s]*/, '');

  const preopByOc = new Map<string, any>();
  const preopByManifest = new Map<string, any>();
  const preopByPlate = new Map<string, any>();

  for (const r of preopRes.rows) {
    if (r.oc_number) preopByOc.set(normOc(r.oc_number), r);
    if (r.id_orden) preopByOc.set(normOc(r.id_orden), r);
    if (r.manifest_number && r.manifest_number.trim()) preopByManifest.set(r.manifest_number.trim().toUpperCase(), r);
    if (r.id_manifest && r.id_manifest.trim()) preopByManifest.set(r.id_manifest.trim().toUpperCase(), r);
    if (r.plate && r.plate.trim()) preopByPlate.set(r.plate.trim().toUpperCase(), r);
  }

  const realizadosList: PreoperacionalOrderDetail[] = [];
  const pendientesList: PreoperacionalOrderDetail[] = [];
  const clientMap = new Map<string, PreoperacionalClientStat>();

  for (const ord of ordersRes.rows) {
    const ocNorm = normOc(ord.oc_number);
    const manifestUpper = (ord.manifest_number || '').trim().toUpperCase();
    const plateUpper = (ord.plate || '').trim().toUpperCase();
    const clientRaw = (ord.client_name || 'DESCONOCIDO').trim();
    const short_client = toShortClientName(clientRaw, clientsMap);

    // Buscar match por OC normalizada, número de manifiesto o placa
    const preMatch = preopByOc.get(ocNorm) || 
                     (manifestUpper ? preopByManifest.get(manifestUpper) : null) ||
                     (plateUpper ? preopByPlate.get(plateUpper) : null);

    let estado = 'Pendiente';
    let driver_name = 'SIN REGISTRO';
    let driver_document = 'S/I';
    let firmado = 'No';

    if (preMatch) {
      const stLower = (preMatch.estado || '').toLowerCase();
      if (stLower.includes('apto') && !stLower.includes('no')) {
        estado = 'Apto';
      } else if (stLower.includes('no apto') || stLower.includes('no_apto')) {
        estado = 'No apto';
      } else if (stLower.includes('pendiente')) {
        estado = 'Pendiente';
      } else {
        estado = preMatch.estado || 'Realizado';
      }
      driver_name = preMatch.driver_name || 'SIN REGISTRO';
      driver_document = preMatch.driver_document || 'S/I';
      firmado = preMatch.firmado || 'Sí';
    } else {
      // Fallback a mapa de conductores por placa registrada
      const knownDriver = plateUpper ? driverByPlateMap.get(plateUpper) : null;
      if (knownDriver) {
        driver_name = knownDriver.driver_name;
        driver_document = knownDriver.driver_document;
      }
    }

    const detailItem: PreoperacionalOrderDetail = {
      oc_number: ord.oc_number,
      manifest_number: ord.manifest_number || 'S/M',
      client_name: clientRaw,
      short_client,
      plate: ord.plate || 'S/P',
      driver_name,
      driver_document,
      estado,
      firmado,
      fecha
    };

    // Agregar a la lista de realizados o pendientes
    if (estado === 'Apto' || estado === 'No apto' || estado === 'Realizado') {
      realizadosList.push(detailItem);
    } else {
      pendientesList.push(detailItem);
    }

    // Acumular por cliente
    const stat = clientMap.get(short_client) || {
      clientRaw,
      shortName: short_client,
      totalOrders: 0,
      realizados: 0,
      aptos: 0,
      noAptos: 0,
      pendientes: 0,
      efectividadPct: 0
    };

    stat.totalOrders++;
    if (estado === 'Apto') {
      stat.realizados++;
      stat.aptos++;
    } else if (estado === 'No apto') {
      stat.realizados++;
      stat.noAptos++;
    } else if (estado === 'Realizado') {
      stat.realizados++;
      stat.aptos++;
    } else {
      stat.pendientes++;
    }
    clientMap.set(short_client, stat);
  }

  // Calcular porcentajes por cliente
  const clientStats = Array.from(clientMap.values()).map(s => ({
    ...s,
    efectividadPct: s.totalOrders > 0 ? Math.round((s.realizados / s.totalOrders) * 100) : 0
  })).sort((a, b) => b.totalOrders - a.totalOrders);

  const totalOrders = ordersRes.rowCount || 0;
  const totalRealizados = realizadosList.length;
  const totalAptos = realizadosList.filter(r => r.estado === 'Apto' || r.estado === 'Realizado').length;
  const totalNoAptos = realizadosList.filter(r => r.estado === 'No apto').length;
  const totalPendientes = pendientesList.length;
  const efectividadGlobal = totalOrders > 0 ? Math.round((totalRealizados / totalOrders) * 100) : 0;

  const [y, m, d] = fecha.split('-');
  const fechaFormateada = `${d}/${m}/${y}`;

  // 3. Formatear mensaje para WhatsApp
  let message = `📋 *OrbitM7 — INFORME CUMPLIMIENTO PREOPERACIONAL*\n`;
  message += `📅 *Fecha:* ${fechaFormateada} (Ayer)\n`;
  message += `⏰ *Hora de verificación:* 06:20 AM\n\n`;

  message += `📊 *Resumen Consolidado General:*\n`;
  message += `• Total Órdenes de Cargue: *${totalOrders}*\n`;
  message += `• Preoperacionales Realizados: *${totalRealizados}* (${efectividadGlobal}% efectividad)\n`;
  message += `  └ Aptos: *${totalAptos}* ✅\n`;
  message += `  └ No Aptos: *${totalNoAptos}* ❌\n`;
  message += `• Preoperacionales Pendientes: *${totalPendientes}* ⚠️\n\n`;

  if (clientStats.length > 0) {
    message += `🏬 *Cumplimiento por Cliente / Bodega:*\n`;
    for (const c of clientStats) {
      message += `• *${c.shortName}*: ${c.realizados}/${c.totalOrders} realizados (${c.efectividadPct}%) | ⚠️ Pendientes: ${c.pendientes}\n`;
    }
    message += `\n──────────────────────────────\n`;
    message += `_Se adjunta informe completo en PDF y Excel con la lista de conductores. Enviado también a su correo electrónico._`;
  }

  // 4. Generar Libro Excel con 3 Hojas
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen General y Clientes
  const resumenRows = [
    { 'Métrica': 'Total Órdenes de Cargue Creadas', 'Cantidad': totalOrders, '% Total': '100%' },
    { 'Métrica': 'Preoperacionales Realizados', 'Cantidad': totalRealizados, '% Total': `${efectividadGlobal}%` },
    { 'Métrica': '  - Aptos', 'Cantidad': totalAptos, '% Total': totalRealizados > 0 ? `${Math.round((totalAptos / totalRealizados) * 100)}%` : '0%' },
    { 'Métrica': '  - No Aptos', 'Cantidad': totalNoAptos, '% Total': totalRealizados > 0 ? `${Math.round((totalNoAptos / totalRealizados) * 100)}%` : '0%' },
    { 'Métrica': 'Preoperacionales Pendientes', 'Cantidad': totalPendientes, '% Total': totalOrders > 0 ? `${Math.round((totalPendientes / totalOrders) * 100)}%` : '0%' },
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumenRows);

  const clientExcelRows = clientStats.map(c => ({
    'Cliente / Bodega': c.shortName,
    'Nombre Completo': c.clientRaw,
    'Total Órdenes': c.totalOrders,
    'Realizados': c.realizados,
    'Aptos': c.aptos,
    'No Aptos': c.noAptos,
    'Pendientes': c.pendientes,
    '% Efectividad': `${c.efectividadPct}%`
  }));
  XLSX.utils.sheet_add_json(wsResumen, clientExcelRows, { origin: 'A9' });
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Ejecutivo');

  // Sheet 2: Realizados
  const wsRealizados = XLSX.utils.json_to_sheet(realizadosList.map(r => ({
    'Orden de Cargue': r.oc_number,
    'Manifiesto': r.manifest_number,
    'Cliente': r.short_client,
    'Placa': r.plate,
    'Conductor': r.driver_name,
    'Doc. Conductor': r.driver_document,
    'Estado Preoperacional': r.estado,
    'Firmado': r.firmado
  })));
  XLSX.utils.book_append_sheet(wb, wsRealizados, 'Realizados');

  // Sheet 3: Pendientes
  const wsPendientes = XLSX.utils.json_to_sheet(pendientesList.map(p => ({
    'Orden de Cargue': p.oc_number,
    'Manifiesto': p.manifest_number,
    'Cliente': p.short_client,
    'Placa': p.plate,
    'Conductor': p.driver_name,
    'Doc. Conductor': p.driver_document,
    'Estado Preoperacional': p.estado
  })));
  XLSX.utils.book_append_sheet(wb, wsPendientes, 'Pendientes');

  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const excelFileName = `Informe_Preoperacional_${fecha}.xlsx`;

  // 5. Generar PDF con Puppeteer
  const pdfHtml = buildPreopPdfHtml(fechaFormateada, totalOrders, totalRealizados, totalAptos, totalNoAptos, totalPendientes, efectividadGlobal, clientStats, pendientesList);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let pdfBase64 = '';
  const pdfFileName = `Informe_Preoperacional_${fecha}.pdf`;

  try {
    const page = await browser.newPage();
    await page.setContent(pdfHtml, { waitUntil: 'load' });
    await page.emulateMediaType('print');
    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    pdfBase64 = `data:application/pdf;base64,${Buffer.from(pdfBuf).toString('base64')}`;
  } finally {
    await browser.close();
  }

  return {
    fecha,
    fechaFormateada,
    totalOrders,
    totalRealizados,
    totalAptos,
    totalNoAptos,
    totalPendientes,
    efectividadGlobal,
    clientStats,
    realizadosList,
    pendientesList,
    message,
    pdfBase64,
    pdfFileName,
    excelBuffer,
    excelFileName
  };
}

function buildPreopPdfHtml(
  fecha: string,
  totalOrders: number,
  totalRealizados: number,
  totalAptos: number,
  totalNoAptos: number,
  totalPendientes: number,
  efectividadGlobal: number,
  clientStats: PreoperacionalClientStat[],
  pendientesList: PreoperacionalOrderDetail[]
): string {
  const fmt = (n: number) => n.toLocaleString('es-CO');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 portrait; margin: 10mm; }
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:9px;color:#1e293b;background:#fff;width:100%;padding:10px}
.header{display:flex;justify-space:between;align-items:center;background:#0f172a;color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:14px}
.title{font-size:16px;font-weight:900;letter-spacing:-0.5px}
.subtitle{font-size:10px;color:#94a3b8;margin-top:2px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.kpi-val{font-size:20px;font-weight:900;color:#0f172a;line-height:1}
.kpi-lbl{font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;margin-top:4px}
.card-green{border-top:3px solid #10b981}
.card-red{border-top:3px solid #ef4444}
.card-yellow{border-top:3px solid #f59e0b}
.card-blue{border-top:3px solid #3b82f6}
.col{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:14px;page-break-inside:auto}
.sec-title{font-size:10px;font-weight:900;color:#0f172a;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:8px;page-break-inside:auto}
thead{display:table-header-group}
tr{page-break-inside:avoid;page-break-after:auto}
th{background:#f1f5f9;color:#334155;font-weight:800;text-align:left;padding:5px 6px;border-bottom:1px solid #cbd5e1}
td{padding:4px 6px;border-bottom:1px solid #e2e8f0;color:#334155}
.badge{padding:2px 6px;border-radius:4px;font-weight:800;font-size:7.5px;display:inline-block}
.bg-apto{background:#d1fae5;color:#065f46}
.bg-no-apto{background:#fee2e2;color:#991b1b}
.bg-pend{background:#fef3c7;color:#92400e}
</style></head><body>

<div class="header">
  <div>
    <div class="title">INFORME DIARIO DE CUMPLIMIENTO PREOPERACIONAL</div>
    <div class="subtitle">Verificación automática Milla 7 & Transportando — Fecha: ${fecha}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900;color:#10b981">${efectividadGlobal}%</div>
    <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700">Efectividad Global</div>
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi-card card-blue">
    <div class="kpi-val">${fmt(totalOrders)}</div>
    <div class="kpi-lbl">Órdenes Creadas</div>
  </div>
  <div class="kpi-card card-green">
    <div class="kpi-val" style="color:#10b981">${fmt(totalAptos)}</div>
    <div class="kpi-lbl">Aptos (Realizados)</div>
  </div>
  <div class="kpi-card card-red">
    <div class="kpi-val" style="color:#ef4444">${fmt(totalNoAptos)}</div>
    <div class="kpi-lbl">No Aptos</div>
  </div>
  <div class="kpi-card card-yellow">
    <div class="kpi-val" style="color:#d97706">${fmt(totalPendientes)}</div>
    <div class="kpi-lbl">Pendientes</div>
  </div>
</div>

<div class="col">
  <div class="sec-title">Efectividad por Cliente / Bodega</div>
  <table>
    <thead>
      <tr>
        <th>CLIENTE</th>
        <th style="text-align:center">ÓRDENES</th>
        <th style="text-align:center">REALIZADOS</th>
        <th style="text-align:center">PENDIENTES</th>
        <th style="text-align:right">% EFECTIVIDAD</th>
      </tr>
    </thead>
    <tbody>
      ${clientStats.map(c => `
        <tr>
          <td><strong>${c.shortName}</strong></td>
          <td style="text-align:center">${c.totalOrders}</td>
          <td style="text-align:center;color:#10b981;font-weight:700">${c.realizados}</td>
          <td style="text-align:center;color:#d97706;font-weight:700">${c.pendientes}</td>
          <td style="text-align:right;font-weight:800;color:${c.efectividadPct >= 80 ? '#10b981' : c.efectividadPct >= 50 ? '#d97706' : '#ef4444'}">${c.efectividadPct}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>

<div class="col">
  <div class="sec-title">Detalle Completo de Conductores / Órdenes Pendientes (${pendientesList.length})</div>
  <table>
    <thead>
      <tr>
        <th>ORDEN</th>
        <th>CLIENTE</th>
        <th>PLACA</th>
        <th>CONDUCTOR</th>
        <th>DOC. CONDUCTOR</th>
        <th style="text-align:center">ESTADO</th>
      </tr>
    </thead>
    <tbody>
      ${pendientesList.map(p => `
        <tr>
          <td><strong>${p.oc_number}</strong></td>
          <td>${p.short_client}</td>
          <td>${p.plate}</td>
          <td>${p.driver_name}</td>
          <td>${p.driver_document}</td>
          <td style="text-align:center"><span class="badge bg-pend">PENDIENTE</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>

<div style="border-top:1px solid #cbd5e1;padding-top:8px;font-size:8px;color:#64748b;display:flex;justify-space:between">
  <span>OrbitM7 — Informe Automático Preoperacional (Consolidado completo enviado por WhatsApp y Correo)</span>
  <span>Generado el: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</span>
</div>

</body></html>`;
}
