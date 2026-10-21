/**
 * Informe de Facturación Pendiente (manifiestos sin factura CXC).
 * Antes vivía en scheduler.service (cron fijo 10:00 AM a TGN-04 y a usuarios); ahora lo usa la
 * alerta FACTURACION_PENDIENTE, que decide por destinatario si va el informe general o por cliente.
 */
import pool from '../config/database.js';
import { AlcanceClientes, sqlFiltroClientes } from './client-scope.service.js';

export interface FacturacionPendienteReport {
    total: number;
    valor: number;
    etiqueta: string;            // "Todos los clientes" o los clientes del alcance
    waMessage: string;           // texto para WhatsApp
    emailHtml: string;           // cuerpo del correo
    excelBuffer: Buffer;
    fileName: string;
}

const COP = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function fechaYMD(v: any): string {
    if (!v) return 'S/I';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'S/I';
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '/');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Genera el informe. Sin `alcance` incluye todos los clientes. Devuelve null si no hay
 * manifiestos pendientes (para no enviar mensajes vacíos).
 */
export async function generateFacturacionPendienteReport(alcance?: AlcanceClientes): Promise<FacturacionPendienteReport | null> {
    const params: any[] = [];
    const filtro = alcance ? `AND ${sqlFiltroClientes('mo', alcance, params)}` : '';
    const res = await pool.query(`
        SELECT mo.manifest_number, mo.manifest_date,
               CASE WHEN COALESCE(mo.total_cxc, 0) = 0 THEN mo.total_value_cxc_final ELSE mo.total_cxc END AS venta,
               mo.client_name, mo.manifest_status, mo.plate
        FROM management_orders mo
        WHERE (
            mo.invoice_cxc IS NULL
            OR TRIM(mo.invoice_cxc) = ''
            OR TRIM(mo.invoice_cxc) = '0'
            OR UPPER(TRIM(mo.invoice_cxc)) IN ('S/I', 'N/A', 'NA', 'SIN FACTURA CXC')
            OR mo.invoice_date IS NULL
            OR COALESCE(mo.total_cxc, 0) = 0
        )
          AND mo.manifest_number IS NOT NULL
          AND TRIM(mo.manifest_number) <> ''
          AND UPPER(TRIM(COALESCE(mo.manifest_status, ''))) NOT IN ('ANULADO', 'ANULADA')
          ${filtro}
        ORDER BY mo.client_name, mo.manifest_date DESC`, params);

    if (!res.rowCount) return null;

    const XLSX_MODULE: any = await import('xlsx');
    const XLSX = XLSX_MODULE.default || XLSX_MODULE;

    const filas = res.rows.map(r => ({
        'Manifiesto': r.manifest_number,
        'Fecha Manifiesto': fechaYMD(r.manifest_date),
        'Cliente': r.client_name,
        'Placa': r.plate ? String(r.plate).trim() : 'S/I',
        'Estado': r.manifest_status ? String(r.manifest_status).trim() : 'S/I',
        'Valor Venta': Number(r.venta) || 0,
    }));
    const valor = filas.reduce((a, f) => a + f['Valor Venta'], 0);

    const porCliente = new Map<string, { count: number; total: number }>();
    for (const f of filas) {
        const c = f['Cliente'] ? String(f['Cliente']).trim() : 'S/I';
        const s = porCliente.get(c) || { count: 0, total: 0 };
        s.count++; s.total += f['Valor Venta'];
        porCliente.set(c, s);
    }
    const resumen = [...porCliente.entries()].sort((a, b) => b[1].total - a[1].total);

    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fact_Pendiente');
    const excelBuffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
    const etiqueta = alcance ? alcance.etiqueta : 'Todos los clientes';
    const sufijo = alcance ? `_${alcance.clientIds.join('-')}` : '_general';
    const fileName = `facturacion_pendiente${sufijo}_${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}.xlsx`;

    const MAX_WA = 15;
    const lineasWa = resumen.slice(0, MAX_WA).map(([c, s]) => `• ${c}: ${s.count} — ${COP(s.total)}`);
    if (resumen.length > MAX_WA) lineasWa.push(`• … y ${resumen.length - MAX_WA} cliente(s) más (ver Excel)`);
    const waMessage =
        `🧾 *Facturación Pendiente — OrbitM7*\n` +
        `Fecha: ${hoy}\n` +
        `Alcance: ${etiqueta}\n\n` +
        `Manifiestos sin facturar: *${filas.length}*\n` +
        `Valor pendiente: *${COP(valor)}*\n\n` +
        `${lineasWa.join('\n')}\n\n` +
        `📎 Detalle completo en el Excel adjunto.`;

    const filasHtml = resumen.map(([c, s]) =>
        `<tr><td style="border:1px solid #d6e0e0;padding:6px 8px;">${esc(c)}</td>` +
        `<td style="border:1px solid #d6e0e0;padding:6px 8px;text-align:center;">${s.count}</td>` +
        `<td style="border:1px solid #d6e0e0;padding:6px 8px;text-align:right;">${COP(s.total)}</td></tr>`).join('');
    const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a2a2a;">
          <div style="background:#0d3b3b;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:17px;">Facturación Pendiente — OrbitM7</h2>
            <p style="margin:4px 0 0;font-size:12px;opacity:.8;">${hoy} · ${esc(etiqueta)}</p>
          </div>
          <div style="border:1px solid #e8f0f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
            <p>Manifiestos sin factura CXC: <b>${filas.length}</b><br/>Valor pendiente: <b>${COP(valor)}</b></p>
            <table style="border-collapse:collapse;width:100%;font-size:13px;">
              <thead><tr style="background:#f1f6f6;">
                <th style="border:1px solid #d6e0e0;padding:6px 8px;text-align:left;">Cliente</th>
                <th style="border:1px solid #d6e0e0;padding:6px 8px;">Cant.</th>
                <th style="border:1px solid #d6e0e0;padding:6px 8px;text-align:right;">Valor</th>
              </tr></thead>
              <tbody>${filasHtml}</tbody>
            </table>
            <p style="margin-top:16px;">El detalle por manifiesto está en el Excel adjunto.</p>
            <p style="font-size:11px;color:#80a0a0;margin-top:20px;">Mensaje automático de OrbitM7 — Milla 7 S.A.S.</p>
          </div>
        </div>`;

    return { total: filas.length, valor, etiqueta, waMessage, emailHtml, excelBuffer, fileName };
}
