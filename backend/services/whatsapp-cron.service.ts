import cron from 'node-cron';
import pool from '../config/database.js';
import { evolutionService } from './evolution.service.js';
import { generateFlotaReportPdf } from './flota-wa-report.service.js';
import { generateCierreFactReport } from './cierre-fact-report.service.js';
import { generateSobrecostoReport } from './sobrecosto-report.service.js';
import { generateSinOperacionDiariaReport } from './sin-operacion-report.service.js';
import { generatePreoperacionalReport } from './preoperacional-report.service.js';
import { generateFacturacionPendienteReport } from './facturacion-pendiente-report.service.js';
import { resolverAlcanceClientes } from './client-scope.service.js';
import { sendEmail } from './notification.service.js';

// Nombre de instancia fijo se resuelve dinámicamente al momento de enviar
const INSTANCE_OVERRIDE = process.env.WA_ALERTS_INSTANCE || '';

/**
 * Los envíos programados solo corren en producción (o con WA_ALERTS_CRON_ENABLED=true): así un
 * entorno de desarrollo no duplica los WhatsApp/correos que ya envía producción.
 * El botón "Enviar prueba" funciona en cualquier entorno.
 */
const CRON_ENABLED = process.env.WA_ALERTS_CRON_ENABLED
  ? process.env.WA_ALERTS_CRON_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';

interface AlertaWA {
  id: string;
  name: string;
  message_template: string;
  cron_expression: string;
  tipo_evento: string;
  adjunto_tipo: string;
  status_id: string;
  client_id?: string;
}

type Canal = 'WHATSAPP' | 'EMAIL' | 'AMBOS';

interface Destinatario {
  id: number;
  nombre: string | null;
  phone_number: string | null;
  email: string | null;
  canal: Canal;
  alcance: 'GENERAL' | 'CLIENTE';
  client_ids: string[];
}

/** Contenido ya generado para un alcance (se reutiliza entre destinatarios con el mismo alcance). */
interface Contenido {
  vacio: boolean;                // no hay datos para este alcance → no se envía
  mensaje: string;               // texto de WhatsApp
  /**
   * Adjuntos por WhatsApp, en orden. El primero lleva el mensaje (+ su caption) como texto;
   * los siguientes van con su propio caption.
   */
  adjuntosWa?: { base64: string; fileName: string; caption?: string }[];
  emailHtml?: string;            // si no viene, se arma con el mensaje
  emailAdjuntos?: { filename: string; content: Buffer }[];
}

export interface ResultadoEnvio {
  whatsapp: number;
  email: number;
  omitidos: number;              // destinatarios sin datos para su alcance
  errores: string[];
}

/** Tipos cuyo informe se puede filtrar por cliente para cada destinatario. */
export const TIPOS_CON_ALCANCE = ['PREOPERACIONAL', 'FACTURACION_PENDIENTE', 'CIERRE_FACT', 'SOBRECOSTO'];

const activeJobs = new Map<string, ReturnType<typeof cron.schedule>>();

function buildMessage(template: string, alerta: AlertaWA): string {
  const now = new Date();
  const fecha = now.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = now.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
  return template
    .replace(/\{\{fecha\}\}/gi,  fecha)
    .replace(/\{\{hora\}\}/gi,   hora)
    .replace(/\{\{alerta\}\}/gi, alerta.name)
    .replace(/\{\{sistema\}\}/gi, 'OrbitM7');
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function buildEmailHtml(alerta: AlertaWA, message: string, caption?: string): string {
  const bodyHtml = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/\n/g, '<br/>');
  const captionHtml = caption ? `<p style="color:#0d3b3b;font-weight:700;">${caption.replace(/[*_]/g, '').replace(/\n/g, '<br/>')}</p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2a2a;">
      <div style="background:#0d3b3b;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:16px;">OrbitM7 — ${alerta.name}</h2>
      </div>
      <div style="border:1px solid #e8f0f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <p>${bodyHtml}</p>
        ${captionHtml}
        <p style="font-size:11px;color:#80a0a0;margin-top:20px;">Mensaje automático de OrbitM7 — Milla 7 S.A.S.</p>
      </div>
    </div>`;
}

const base64Puro = (b64: string) => (b64.includes(';base64,') ? b64.split(';base64,')[1] : b64);

class WhatsAppCronRunner {
  /**
   * Genera el contenido de la alerta para un alcance. `clientIds` vacío = informe general
   * (para CIERRE_FACT/SOBRECOSTO, el general respeta el filtro de bodegas de la propia alerta).
   */
  async generarContenido(alerta: AlertaWA, clientIds: string[]): Promise<Contenido> {
    const base = buildMessage(alerta.message_template || alerta.name, alerta);
    const alcance = clientIds.length ? await resolverAlcanceClientes(clientIds) : undefined;

    if (alerta.tipo_evento === 'FACTURACION_PENDIENTE') {
      const r = await generateFacturacionPendienteReport(alcance);
      if (!r) return { vacio: true, mensaje: '' };
      const intro = alerta.message_template?.trim() ? `${base}\n\n` : '';
      return {
        vacio: false,
        mensaje: `${intro}${r.waMessage}`,
        adjuntosWa: [{ base64: r.excelBuffer.toString('base64'), fileName: r.fileName }],
        emailHtml: r.emailHtml,
        emailAdjuntos: [{ filename: r.fileName, content: r.excelBuffer }],
      };
    }

    if (alerta.tipo_evento === 'PREOPERACIONAL' || alerta.adjunto_tipo === 'informe_preoperacional') {
      const r = await generatePreoperacionalReport(undefined, alcance);
      if (alcance && r.totalOrders === 0) return { vacio: true, mensaje: '' };
      const caption = `📋 *Informe Preoperacional OrbitM7*\nFecha: ${r.fechaFormateada}` +
        (alcance ? `\nCliente(s): ${alcance.etiqueta}` : '') +
        `\nRealizados: ${r.totalRealizados}/${r.totalOrders} (${r.efectividadGlobal}%) | Aptos: ${r.totalAptos} | Pendientes: ${r.totalPendientes}`;
      return {
        vacio: false,
        mensaje: r.message,
        adjuntosWa: [
          { base64: r.pdfBase64, fileName: r.pdfFileName, caption },
          { base64: r.excelBuffer.toString('base64'), fileName: r.excelFileName, caption: '📊 Excel con la lista de conductores (realizados y pendientes)' },
        ],
        emailHtml: buildEmailHtml(alerta, r.message, caption),
        emailAdjuntos: [
          { filename: r.pdfFileName, content: Buffer.from(base64Puro(r.pdfBase64), 'base64') },
          { filename: r.excelFileName, content: r.excelBuffer },
        ],
      };
    }

    if (alerta.tipo_evento === 'SIN_OPERACION_DIARIA') {
      const r = await generateSinOperacionDiariaReport();
      return { vacio: false, mensaje: r.message };
    }

    if (alerta.tipo_evento === 'CIERRE_FACT') {
      const filtro = clientIds.length ? clientIds.join(',') : (alerta.client_id || undefined);
      const r = await generateCierreFactReport(filtro);
      // Por cliente sin planillas pendientes → no se envía (el general sí, aunque esté en cero)
      if (clientIds.length && r.totalPlanillas === 0) return { vacio: true, mensaje: '' };
      // Dash informativo (resumen general) + PDF con el detalle por planilla
      return {
        vacio: false,
        mensaje: base,
        adjuntosWa: [
          { base64: r.dashboardPngBase64, fileName: r.dashboardFileName, caption: r.caption },
          { base64: r.base64, fileName: r.fileName, caption: '📄 Detalle por planilla (PDF)' },
        ],
        emailHtml: `${buildEmailHtml(alerta, base)}<div style="margin-top:12px;">${r.dashboardHtml}</div>`,
        emailAdjuntos: [{ filename: r.fileName, content: Buffer.from(base64Puro(r.base64), 'base64') }],
      };
    }

    if (alerta.tipo_evento === 'SOBRECOSTO') {
      const filtro = clientIds.length ? clientIds.join(',') : (alerta.client_id || undefined);
      const pdf = await generateSobrecostoReport(filtro);
      return {
        vacio: false,
        mensaje: base,
        adjuntosWa: [pdf],
        emailAdjuntos: [{ filename: pdf.fileName, content: Buffer.from(base64Puro(pdf.base64), 'base64') }],
      };
    }

    if (alerta.adjunto_tipo === 'informe_flota') {
      const pdf = await generateFlotaReportPdf();
      return {
        vacio: false,
        mensaje: base,
        adjuntosWa: [pdf],
        emailAdjuntos: [{ filename: pdf.fileName, content: Buffer.from(base64Puro(pdf.base64), 'base64') }],
      };
    }

    return { vacio: false, mensaje: base };
  }

  /**
   * Envía la alerta. Cada destinatario recibe el informe de su alcance (general o sus clientes)
   * por su canal (WhatsApp, correo o ambos). El informe de cada alcance se genera una sola vez.
   */
  async sendAlerta(alerta: AlertaWA, isTest = false): Promise<ResultadoEnvio> {
    const resultado: ResultadoEnvio = { whatsapp: 0, email: 0, omitidos: 0, errores: [] };

    // Solo destinatarios habilitados — uno deshabilitado queda en la lista pero no recibe nada.
    const destRes = await pool.query(
      `SELECT id, nombre, phone_number, email, canal, alcance, client_ids
       FROM alertas_whatsapp_destinatarios
       WHERE alerta_id = $1 AND enabled = true
       ORDER BY id`,
      [alerta.id]
    );
    const destinatarios: Destinatario[] = destRes.rows;
    if (destinatarios.length === 0) return resultado;

    const usaAlcance = TIPOS_CON_ALCANCE.includes(alerta.tipo_evento) || alerta.adjunto_tipo === 'informe_preoperacional';
    const alcanceDe = (d: Destinatario) =>
      usaAlcance && d.alcance === 'CLIENTE' && d.client_ids?.length ? [...d.client_ids].sort() : [];

    // WhatsApp solo si algún destinatario lo usa; si no hay instancia, los correos igual salen.
    const necesitaWa = destinatarios.some(d => d.canal !== 'EMAIL' && d.phone_number);
    let INSTANCE = '';
    if (necesitaWa) {
      INSTANCE = INSTANCE_OVERRIDE || await evolutionService.findFirstConnectedInstance() || '';
      if (INSTANCE) {
        await evolutionService.ensureInstance(INSTANCE);
      } else {
        const msg = 'No hay ninguna instancia de WhatsApp conectada (Conexión WhatsApp). Solo se enviaron correos.';
        console.error(`[WA-CRON] ${msg}`);
        resultado.errores.push(msg);
      }
    }

    const cache = new Map<string, Promise<Contenido>>();
    const contenidoPara = (clientIds: string[]) => {
      const key = clientIds.join(',') || '__GENERAL__';
      if (!cache.has(key)) cache.set(key, this.generarContenido(alerta, clientIds));
      return cache.get(key)!;
    };

    let waCaido = false;
    for (const dest of destinatarios) {
      const clientIds = alcanceDe(dest);
      let contenido: Contenido;
      try {
        contenido = await contenidoPara(clientIds);
      } catch (err: any) {
        const msg = `Error generando informe${clientIds.length ? ` (${clientIds.join(', ')})` : ''}: ${err.message}`;
        console.error(`[WA-CRON] ${msg}`);
        if (!resultado.errores.includes(msg)) resultado.errores.push(msg);
        continue;
      }
      if (contenido.vacio) {
        resultado.omitidos++;
        continue;
      }
      const quien = dest.nombre || dest.phone_number || dest.email;

      // WhatsApp
      if (dest.canal !== 'EMAIL' && dest.phone_number && INSTANCE && !waCaido) {
        try {
          // Revalidar la conexión antes de CADA envío: en listas largas la sesión puede caerse.
          if (!(await evolutionService.isInstanceOpen(INSTANCE))) {
            waCaido = true;
            const msg = `La instancia "${INSTANCE}" se desconectó a mitad del envío; WhatsApp restantes omitidos desde ${quien}.`;
            console.error(`[WA-CRON] ${msg}`);
            resultado.errores.push(msg);
          } else {
            const adjuntos = contenido.adjuntosWa || [];
            if (adjuntos.length === 0) {
              await evolutionService.sendMessageDirect(INSTANCE, dest.phone_number, contenido.mensaje);
            }
            for (const [i, adj] of adjuntos.entries()) {
              const texto = i === 0
                ? (adj.caption ? `${contenido.mensaje}\n\n${adj.caption}` : contenido.mensaje)
                : (adj.caption || adj.fileName);
              if (i > 0) await sleep(2000);
              await evolutionService.sendMediaDirect(INSTANCE, dest.phone_number, adj.base64, adj.fileName, texto);
            }
            resultado.whatsapp++;
            await sleep(5000); // rate limit: 1 destinatario / 5s para evitar throttling de WhatsApp
          }
        } catch (err: any) {
          console.error(`[WA-CRON] Error enviando WhatsApp a ${quien}:`, err.message);
          resultado.errores.push(`WhatsApp ${quien}: ${err.message}`);
        }
      }

      // Correo
      if (dest.canal !== 'WHATSAPP' && dest.email) {
        try {
          await sendEmail(
            dest.email,
            `OrbitM7 — ${alerta.name}${clientIds.length ? ' (por cliente)' : ''}`,
            contenido.emailHtml || buildEmailHtml(alerta, contenido.mensaje, contenido.adjuntosWa?.[0]?.caption),
            contenido.emailAdjuntos
          );
          resultado.email++;
        } catch (err: any) {
          console.error(`[WA-CRON] Error enviando correo a ${dest.email}:`, err.message);
          resultado.errores.push(`Correo ${dest.email}: ${err.message}`);
        }
      }
    }

    if (!isTest) {
      await pool.query(`UPDATE alertas_whatsapp SET last_run = NOW() WHERE id = $1`, [alerta.id]).catch(() => {});
    }

    console.log(`[WA-CRON] Alerta "${alerta.name}": ${resultado.whatsapp} WhatsApp, ${resultado.email} correo(s), ` +
      `${resultado.omitidos} sin datos para su alcance, ${resultado.errores.length} error(es).`);
    return resultado;
  }

  /** Ejecuta ahora la alerta activa de un tipo (usado por los botones manuales del panel de administración). */
  async runByTipo(tipoEvento: string): Promise<string[]> {
    const logs: string[] = [`[${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}] Ejecutando alertas ${tipoEvento}...`];
    const res = await pool.query(`SELECT * FROM alertas_whatsapp WHERE tipo_evento = $1 AND status_id = 'EST-01'`, [tipoEvento]);
    if (!res.rowCount) {
      logs.push(`No hay alertas activas de tipo ${tipoEvento}. Configúrela en Alertas WhatsApp.`);
      return logs;
    }
    for (const alerta of res.rows) {
      const r = await this.sendAlerta(alerta);
      logs.push(`"${alerta.name}": ${r.whatsapp} WhatsApp, ${r.email} correo(s), ${r.omitidos} sin datos.`);
      r.errores.forEach(e => logs.push(`ERROR: ${e}`));
    }
    return logs;
  }

  async loadAndSchedule() {
    // Limpiar jobs previos
    for (const [id, task] of activeJobs) {
      task.stop();
      activeJobs.delete(id);
    }

    if (!CRON_ENABLED) {
      console.log('[WA-CRON] Envíos programados deshabilitados en este entorno (NODE_ENV≠production). ' +
        'Use WA_ALERTS_CRON_ENABLED=true para activarlos; "Enviar prueba" sigue disponible.');
      return;
    }

    let alertas: AlertaWA[] = [];
    try {
      const result = await pool.query(
        `SELECT * FROM alertas_whatsapp WHERE status_id = 'EST-01'`
      );
      alertas = result.rows;
    } catch {
      console.warn('[WA-CRON] Tabla alertas_whatsapp aún no existe, saltando scheduler.');
      return;
    }

    if (alertas.length === 0) {
      console.log('[WA-CRON] Sin alertas activas configuradas.');
      return;
    }

    for (const alerta of alertas) {
      const expr = alerta.cron_expression;
      if (!cron.validate(expr)) {
        console.warn(`[WA-CRON] Expresión cron inválida en alerta "${alerta.name}": ${expr}`);
        continue;
      }

      const task = cron.schedule(expr, async () => {
        console.log(`[WA-CRON] Ejecutando alerta programada: ${alerta.name}`);
        try {
          await this.sendAlerta(alerta);
        } catch (err: any) {
          console.error(`[WA-CRON] Falló la alerta "${alerta.name}":`, err.message);
        }
      }, { timezone: 'America/Bogota' });

      activeJobs.set(alerta.id, task);
      console.log(`[WA-CRON] Alerta "${alerta.name}" programada: ${expr}`);
    }

    console.log(`[WA-CRON] ${activeJobs.size} alerta(s) WhatsApp activa(s).`);
  }

  // Recarga cuando se guarda/elimina una alerta sin reiniciar el servidor
  async reload() {
    await this.loadAndSchedule();
  }
}

export const whatsappCronRunner = new WhatsAppCronRunner();
