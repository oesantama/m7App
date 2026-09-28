import pool from '../config/database.js';

export interface SinOperacionCliente {
  id: string;
  name: string;
  short_name: string;
  m7_trips: number;
  tdm_trips: number;
  total_trips: number;
}

export interface SinOperacionReportResult {
  message: string;
  fecha: string;
  sinOperacionList: SinOperacionCliente[];
  conOperacionCount: number;
  totalDiariosCount: number;
}

function getYesterdayIso(): string {
  const bogotaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [y, m, d] = bogotaHoy.split('-').map(Number);
  const ayer = new Date(y, m - 1, d - 1);
  return `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
}

export async function generateSinOperacionDiariaReport(fechaOverride?: string): Promise<SinOperacionReportResult> {
  const fecha = fechaOverride || getYesterdayIso();

  // 1. Obtener clientes configurados con validación DIARIO
  const clientsRes = await pool.query(`
    SELECT id, name, short_name 
    FROM clients 
    WHERE UPPER(TRIM(report_type)) = 'DIARIO'
      AND (status_id IS NULL OR status_id = 'EST-01')
    ORDER BY name ASC
  `);

  const dailyClients = clientsRes.rows;

  // 2. Consultar viajes en Transportando (management_orders) para la fecha dada
  const m7Res = await pool.query(`
    SELECT TRIM(client_name) AS client_name, COUNT(*)::int AS cnt
    FROM management_orders
    WHERE manifest_date::date = $1
      AND manifest_status NOT IN ('ANULADO','CANCELADO','ANULADA')
      AND manifest_date IS NOT NULL
    GROUP BY TRIM(client_name)
  `, [fecha]);

  const m7Ops: { client_name: string; cnt: number }[] = m7Res.rows;

  // 3. Consultar viajes en TDM (flota_tdm_manifiestos) para la fecha dada
  const tdmRes = await pool.query(`
    SELECT ftm.client_id, TRIM(c.name) AS client_name, COUNT(*)::int AS cnt
    FROM flota_tdm_manifiestos ftm
    LEFT JOIN clients c ON ftm.client_id = c.id
    WHERE ftm.fecha_operacion = $1
    GROUP BY ftm.client_id, c.name
  `, [fecha]);

  const tdmOps: { client_id: string; client_name: string; cnt: number }[] = tdmRes.rows;

  // 4. Evaluar cuáles clientes diarios NO tuvieron operaciones ni en Transportando ni en TDM
  const sinOperacionList: SinOperacionCliente[] = [];
  let conOperacionCount = 0;

  for (const c of dailyClients) {
    const cNameUpper = (c.name || '').trim().toUpperCase();
    const cShortUpper = (c.short_name || '').trim().toUpperCase();
    const cIdUpper = (c.id || '').trim().toUpperCase();

    // Conteo M7
    let m7Trips = 0;
    for (const op of m7Ops) {
      const opNameUpper = (op.client_name || '').trim().toUpperCase();
      if (
        opNameUpper === cNameUpper ||
        (cShortUpper.length >= 2 && opNameUpper.includes(cShortUpper)) ||
        (cNameUpper.length >= 3 && opNameUpper.includes(cNameUpper)) ||
        (opNameUpper.length >= 3 && cNameUpper.includes(opNameUpper))
      ) {
        m7Trips += op.cnt;
      }
    }

    // Conteo TDM
    let tdmTrips = 0;
    for (const op of tdmOps) {
      const opClientIdUpper = (op.client_id || '').trim().toUpperCase();
      const opNameUpper = (op.client_name || '').trim().toUpperCase();
      if (
        opClientIdUpper === cIdUpper ||
        opNameUpper === cNameUpper ||
        (cShortUpper.length >= 2 && opNameUpper.includes(cShortUpper))
      ) {
        tdmTrips += op.cnt;
      }
    }

    const totalTrips = m7Trips + tdmTrips;

    if (totalTrips === 0) {
      sinOperacionList.push({
        id: c.id,
        name: c.name,
        short_name: c.short_name || c.name,
        m7_trips: m7Trips,
        tdm_trips: tdmTrips,
        total_trips: totalTrips,
      });
    } else {
      conOperacionCount++;
    }
  }

  // 5. Formatear mensaje optimizado para WhatsApp
  const [y, m, d] = fecha.split('-');
  const fechaFormateada = `${d}/${m}/${y}`;

  let message = `📢 *OrbitM7 — NOVEDAD OPERACIÓN CLIENTES DIARIOS*\n`;
  message += `📅 *Fecha de consulta:* ${fechaFormateada} (Ayer)\n`;
  message += `⏰ *Hora de verificación:* 06:30 AM\n\n`;

  if (sinOperacionList.length > 0) {
    message += `⚠️ *Clientes con validación DIARIA sin operación registrada ayer (${sinOperacionList.length}/${dailyClients.length}):*\n\n`;
    for (const item of sinOperacionList) {
      const displayName = (item.short_name || item.name).toUpperCase();
      message += `• *${displayName}* (${item.name})\n  └ Sin viajes en Transportando (M7) ni TDM\n\n`;
    }
    message += `──────────────────────────────\n`;
    message += `_Este informe fue verificado automáticamente en Transportando y TDM._`;
  } else {
    message += `✅ *Todos los clientes con validación DIARIA (${dailyClients.length}) registraron operaciones correctamente el día de ayer.*\n\n`;
    message += `──────────────────────────────\n`;
    message += `_Este informe fue verificado automáticamente en Transportando y TDM._`;
  }

  return {
    message,
    fecha,
    sinOperacionList,
    conOperacionCount,
    totalDiariosCount: dailyClients.length,
  };
}
