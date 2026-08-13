import os from 'os';
import pool from '../config/database.js';
import { sendEmail } from './notification.service.js';

const REPORT_RECIPIENT = process.env.HEALTH_REPORT_EMAIL || 'oscars.santamaria@gmail.com';

// Tablas grandes/críticas a vigilar — mismas involucradas en el bug de mastersuite-report
const WATCHED_TABLES = [
  'document_items', 'documents_l', 'route_invoices', 'dispatch_assignments',
  'invoice_status_history', 'notificaciones', 'cron_logs', 'assignments'
];

interface Finding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  detail: string;
  suggestion: string;
}

async function collectPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

async function collectLongRunningQueries() {
  const res = await pool.query(`
    SELECT pid,
           EXTRACT(EPOCH FROM (now() - query_start))::int AS seconds,
           state,
           wait_event_type,
           left(query, 200) AS query
    FROM pg_stat_activity
    WHERE state != 'idle'
      AND query_start IS NOT NULL
      AND now() - query_start > interval '10 seconds'
      AND pid != pg_backend_pid()
    ORDER BY seconds DESC
    LIMIT 10
  `);
  return res.rows;
}

async function collectConnectionUsage() {
  const [activeRes, maxRes] = await Promise.all([
    pool.query(`SELECT count(*)::int AS active FROM pg_stat_activity`),
    pool.query(`SHOW max_connections`),
  ]);
  return {
    active: activeRes.rows[0].active,
    max: parseInt(maxRes.rows[0].max_connections, 10),
  };
}

async function collectTableSizes() {
  const res = await pool.query(`
    SELECT relname,
           n_live_tup,
           pg_size_pretty(pg_total_relation_size(relid)) AS size
    FROM pg_stat_user_tables
    WHERE relname = ANY($1)
    ORDER BY n_live_tup DESC
  `, [WATCHED_TABLES]);
  return res.rows;
}

async function collectRecentCronErrors() {
  const res = await pool.query(`
    SELECT task_name, error_message, created_at
    FROM cron_logs
    WHERE status = 'ERROR' AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  return res.rows;
}

function collectProcessMemory() {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  return { heapUsedMB, heapTotalMB, rssMB, pct };
}

function collectSystemMemory() {
  const totalMB = Math.round(os.totalmem() / 1024 / 1024);
  const freeMB = Math.round(os.freemem() / 1024 / 1024);
  const usedPct = Math.round(((totalMB - freeMB) / totalMB) * 100);
  return { totalMB, freeMB, usedPct };
}

function buildFindings(data: {
  poolStats: { total: number; idle: number; waiting: number };
  longQueries: any[];
  connUsage: { active: number; max: number };
  tableSizes: any[];
  cronErrors: any[];
  procMem: { heapUsedMB: number; heapTotalMB: number; rssMB: number; pct: number };
  sysMem: { totalMB: number; freeMB: number; usedPct: number };
  poolMax: number;
}): Finding[] {
  const findings: Finding[] = [];

  if (data.poolStats.waiting > 0 || data.poolStats.total >= data.poolMax * 0.9) {
    findings.push({
      severity: 'CRITICAL',
      title: 'Pool de conexiones de Postgres cerca del límite',
      detail: `Total: ${data.poolStats.total}/${data.poolMax} | Inactivas: ${data.poolStats.idle} | En espera: ${data.poolStats.waiting}`,
      suggestion: 'Revisar la sección "Queries activas de larga duración" de este informe — probablemente hay una consulta mal indexada reteniendo conexiones. Aplicar el mismo patrón de fix usado en mastersuite-report (filtrar CTEs/joins por el conjunto ya reducido en vez de escanear la tabla completa).',
    });
  }

  if (data.longQueries.length > 0) {
    findings.push({
      severity: 'WARNING',
      title: `${data.longQueries.length} query(s) activas por más de 10 segundos`,
      detail: data.longQueries
        .map((q) => `PID ${q.pid} (${q.seconds}s, ${q.state}): ${q.query}`)
        .join('\n'),
      suggestion: 'Si esta consulta se repite en informes futuros, localizar el endpoint correspondiente y revisar si tiene JOINs/CTEs sin filtrar (mismo patrón del bug de mastersuite-report) o si le falta un índice.',
    });
  }

  if (data.connUsage.active >= data.connUsage.max * 0.85) {
    findings.push({
      severity: 'WARNING',
      title: 'Uso alto de conexiones totales en Postgres',
      detail: `${data.connUsage.active}/${data.connUsage.max} conexiones activas en el servidor (todas las apps que usan esta BD)`,
      suggestion: 'Verificar si hay otro proceso o script externo abriendo conexiones sin cerrarlas.',
    });
  }

  if (data.procMem.pct > 85) {
    findings.push({
      severity: 'WARNING',
      title: 'Heap de Node.js (worker líder) por encima del 85%',
      detail: `${data.procMem.heapUsedMB}/${data.procMem.heapTotalMB} MB (${data.procMem.pct}%) | RSS: ${data.procMem.rssMB} MB`,
      suggestion: 'Node ya fuerza GC automáticamente vía el keep-alive. Si esto persiste, revisar posibles fugas de memoria en el worker líder.',
    });
  }

  if (data.sysMem.usedPct > 85) {
    findings.push({
      severity: 'CRITICAL',
      title: 'Memoria RAM del droplet casi agotada',
      detail: `${data.sysMem.usedPct}% usado (Libre: ${data.sysMem.freeMB} MB de ${data.sysMem.totalMB} MB)`,
      suggestion: 'Candidato principal: procesos Chromium de Puppeteer (usados en 7 servicios de generación de PDF) no liberados correctamente. Revisar con "podman/docker stats" o "ps aux | grep chromium" en el droplet cuánta memoria consumen procesos huérfanos.',
    });
  }

  if (data.cronErrors.length > 0) {
    findings.push({
      severity: 'WARNING',
      title: `${data.cronErrors.length} tarea(s) programada(s) fallaron en las últimas 24h`,
      detail: data.cronErrors
        .map((e) => `[${new Date(e.created_at).toLocaleString('es-CO')}] ${e.task_name}: ${e.error_message}`)
        .join('\n'),
      suggestion: 'Revisar el log detallado de cada tarea en la tabla cron_logs para diagnosticar la causa.',
    });
  }

  return findings;
}

function renderHtmlReport(findings: Finding[], data: {
  poolStats: { total: number; idle: number; waiting: number };
  connUsage: { active: number; max: number };
  tableSizes: any[];
  procMem: { heapUsedMB: number; heapTotalMB: number; rssMB: number; pct: number };
  sysMem: { totalMB: number; freeMB: number; usedPct: number };
  poolMax: number;
}): string {
  const severityColor: Record<string, string> = { CRITICAL: '#dc2626', WARNING: '#d97706', INFO: '#2563eb' };
  const findingsHtml = findings.length === 0
    ? `<p style="color:#16a34a;font-weight:bold;">✅ No se detectaron anomalías en las últimas 24 horas.</p>`
    : findings.map(f => `
      <div style="border-left:4px solid ${severityColor[f.severity]};padding:8px 12px;margin-bottom:12px;background:#f9fafb;">
        <div style="font-weight:bold;color:${severityColor[f.severity]};">[${f.severity}] ${f.title}</div>
        <pre style="white-space:pre-wrap;font-size:12px;background:#fff;padding:6px;border-radius:4px;margin:6px 0;">${f.detail}</pre>
        <div style="font-size:13px;"><strong>Sugerencia:</strong> ${f.suggestion}</div>
      </div>
    `).join('');

  const tablesHtml = data.tableSizes.map(t =>
    `<tr><td style="padding:4px 8px;">${t.relname}</td><td style="padding:4px 8px;">${t.n_live_tup}</td><td style="padding:4px 8px;">${t.size}</td></tr>`
  ).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
    <h2 style="color:#4f46e5;">Informe Diario de Salud — OrbitM7</h2>
    <p style="color:#6b7280;">${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>

    <h3>Hallazgos</h3>
    ${findingsHtml}

    <h3>Métricas de Infraestructura</h3>
    <ul style="font-size:13px;">
      <li>Pool Postgres (worker líder): ${data.poolStats.total} conexiones (idle: ${data.poolStats.idle}, esperando: ${data.poolStats.waiting}) / máx ${data.poolMax}</li>
      <li>Conexiones totales al servidor Postgres: ${data.connUsage.active}/${data.connUsage.max}</li>
      <li>Memoria Node.js (worker líder): ${data.procMem.heapUsedMB}/${data.procMem.heapTotalMB} MB heap (${data.procMem.pct}%), RSS ${data.procMem.rssMB} MB</li>
      <li>Memoria del droplet: ${data.sysMem.usedPct}% usado (${data.sysMem.freeMB} MB libres de ${data.sysMem.totalMB} MB)</li>
    </ul>

    <h3>Tamaño de tablas críticas</h3>
    <table style="border-collapse:collapse;font-size:13px;width:100%;">
      <tr style="background:#f3f4f6;"><th style="text-align:left;padding:4px 8px;">Tabla</th><th style="text-align:left;padding:4px 8px;">Filas</th><th style="text-align:left;padding:4px 8px;">Tamaño</th></tr>
      ${tablesHtml}
    </table>

    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Este informe es solo diagnóstico — no aplica cambios automáticamente en el código ni en producción.</p>
  </div>`;
}

export const runDailyHealthReport = async (): Promise<string[]> => {
  const logs: string[] = [];
  logs.push(`[${new Date().toLocaleString()}] Iniciando informe diario de salud...`);

  const POOL_SIZE = process.env.NODE_ENV === 'production' ? 10 : 20;

  const [poolStats, longQueries, connUsage, tableSizes, cronErrors] = await Promise.all([
    collectPoolStats(),
    collectLongRunningQueries(),
    collectConnectionUsage(),
    collectTableSizes(),
    collectRecentCronErrors(),
  ]);
  const procMem = collectProcessMemory();
  const sysMem = collectSystemMemory();

  const findings = buildFindings({ poolStats, longQueries, connUsage, tableSizes, cronErrors, procMem, sysMem, poolMax: POOL_SIZE });

  const hasCritical = findings.some(f => f.severity === 'CRITICAL');
  const hasWarning = findings.some(f => f.severity === 'WARNING');
  const badge = hasCritical ? '🔴' : hasWarning ? '🟡' : '✅';
  const subject = `${badge} Informe Diario OrbitM7 — ${findings.length === 0 ? 'Todo OK' : `${findings.length} hallazgo(s)`} — ${new Date().toLocaleDateString('es-CO')}`;

  const html = renderHtmlReport(findings, { poolStats, connUsage, tableSizes, procMem, sysMem, poolMax: POOL_SIZE });

  await sendEmail(REPORT_RECIPIENT, subject, html);

  logs.push(`Informe enviado a ${REPORT_RECIPIENT}. Hallazgos: ${findings.length} (críticos: ${findings.filter(f => f.severity === 'CRITICAL').length}, advertencias: ${findings.filter(f => f.severity === 'WARNING').length})`);
  return logs;
};
