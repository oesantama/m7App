import pool from '../config/database.js';
import { scrapeTransportandoReports, periodosDeMeses, PeriodoConsulta, activeScraperLogs } from './scraper.service.js';

/**
 * Cron nocturno de Transportando: en lugar de recorrer todos los meses, consulta solo los
 * meses que todavía tienen información pendiente en management_orders, del más reciente al
 * más antiguo (máximo 12 meses atrás).
 *  - Manifiestos: órdenes no anuladas sin factura CXC, recibo o egreso, o con el manifiesto
 *    aún abierto (Autorizado/Pendiente) — mes de la OC.
 *  - Recaudos: órdenes con número de recibo pero sin fecha de recibo (mes de la factura CXC
 *    y el siguiente, porque el recaudo suele registrarse después de facturar).
 *  - Egresos: órdenes con número de egreso pero sin fecha de egreso (mes de la CXP y el siguiente).
 */
const VENTANA_MESES = 12;

export type TipoPendiente = 'manifiestos' | 'recaudos' | 'egresos';

// Transportando llena los campos vacíos con textos como "Sin recibo", "Sin egreso" o "Sin Factura CXC"
const vacio = (col: string) => `(COALESCE(TRIM(${col}), '') = '' OR ${col} ILIKE 'Sin %')`;
const NO_ANULADA = `COALESCE(oc_status, '') <> 'Anulado'`;
const MANIFIESTO_ABIERTO = `COALESCE(manifest_status, '') NOT IN ('Completado', 'Cumplido', 'Anulado')`;

const CONSULTAS: Record<TipoPendiente, { fecha: string; condicion: string; mesSiguiente: boolean }> = {
    manifiestos: {
        fecha: 'oc_date',
        condicion: `${NO_ANULADA} AND (${vacio('invoice_cxc')} OR ${vacio('receipt')} OR ${vacio('egress')} OR ${MANIFIESTO_ABIERTO})`,
        mesSiguiente: false,
    },
    recaudos: {
        fecha: 'COALESCE(invoice_date, oc_date)',
        condicion: `${NO_ANULADA} AND NOT ${vacio('receipt')} AND fecha_recibo IS NULL`,
        mesSiguiente: true,
    },
    egresos: {
        fecha: 'COALESCE(cxp_date, oc_date)',
        condicion: `${NO_ANULADA} AND NOT ${vacio('egress')} AND fecha_egreso IS NULL`,
        mesSiguiente: true,
    },
};

/** Meses (YYYY-MM) con pendientes y cuántas órdenes tiene cada uno, del más reciente al más antiguo. */
export async function mesesPendientes(tipo: TipoPendiente): Promise<{ mes: string; pendientes: number }[]> {
    const c = CONSULTAS[tipo];
    const { rows } = await pool.query(`
        SELECT to_char(date_trunc('month', (${c.fecha}) AT TIME ZONE 'America/Bogota'), 'YYYY-MM') AS mes, COUNT(*)::int AS pendientes
        FROM management_orders
        WHERE ${c.fecha} >= date_trunc('month', (NOW() AT TIME ZONE 'America/Bogota') - INTERVAL '${VENTANA_MESES} months')
          AND ${c.condicion}
        GROUP BY 1
        ORDER BY 1 DESC
    `);
    return rows;
}

const mesSiguiente = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export async function periodosPendientes(tipo: TipoPendiente): Promise<{ periodos: PeriodoConsulta[]; resumen: string }> {
    const meses = await mesesPendientes(tipo);
    const lista = meses.flatMap(m => CONSULTAS[tipo].mesSiguiente ? [m.mes, mesSiguiente(m.mes)] : [m.mes]);
    const resumen = meses.length
        ? meses.map(m => `${m.mes} (${m.pendientes})`).join(', ')
        : 'sin pendientes';
    return { periodos: periodosDeMeses(lista), resumen };
}

/** Consulta en Transportando solo los meses pendientes de cada tipo, en secuencia (una sola sesión a la vez). */
export async function runTransportandoPendientes(tipos: TipoPendiente[]): Promise<string[]> {
    const logs: string[] = [];
    // Se reflejan también en la terminal del panel (el scraper la reinicia en cada consulta)
    const log = (m: string) => { logs.push(m); activeScraperLogs.push(m); console.log(`[TRANSPORTANDO-PENDIENTES] ${m}`); };
    for (const tipo of tipos) {
        const { periodos, resumen } = await periodosPendientes(tipo);
        log(`[PENDIENTES ${tipo.toUpperCase()}] Meses con pendientes: ${resumen}`);
        if (!periodos.length) {
            log(`[PENDIENTES ${tipo.toUpperCase()}] Nada que consultar.`);
            continue;
        }
        logs.push(...await scrapeTransportandoReports(tipo, periodos));
    }
    return logs;
}
