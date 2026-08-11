import cron from 'node-cron';
import pool from '../config/database.js';
import { evolutionService } from './evolution.service.js';
import { generateFlotaReportPdf } from './flota-wa-report.service.js';
import { generateCierreFactReport } from './cierre-fact-report.service.js';
import { generateSobrecostoReport } from './sobrecosto-report.service.js';
import { sendEmail } from './notification.service.js';

// Nombre de instancia fijo se resuelve dinámicamente al momento de enviar
const INSTANCE_OVERRIDE = process.env.WA_ALERTS_INSTANCE || '';

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
  const bodyHtml = message.replace(/\n/g, '<br/>');
  const captionHtml = caption ? `<p style="color:#0d3b3b;font-weight:700;">${caption.replace(/[*_]/g, '').replace(/\n/g, '<br/>')}</p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a2a2a;">
      <div style="background:#0d3b3b;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:16px;">OrbitM7 — ${alerta.name}</h2>
      </div>
      <div style="border:1px solid #e8f0f0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        <p>${bodyHtml}</p>
        ${captionHtml}
        <p style="font-size:11px;color:#80a0a0;margin-top:20px;">Este correo es una copia de respaldo del mensaje automático enviado por WhatsApp — Milla 7 S.A.S.</p>
      </div>
    </div>`;
}

class WhatsAppCronRunner {
  async sendAlerta(alerta: AlertaWA, isTest = false): Promise<number> {
    // Solo destinatarios habilitados — un número deshabilitado queda en la lista pero no recibe nada.
    const destRes = await pool.query(
      'SELECT phone_number, email FROM alertas_whatsapp_destinatarios WHERE alerta_id = $1 AND enabled = true',
      [alerta.id]
    );
    const destinatarios: { phone_number: string; email: string | null }[] = destRes.rows;
    if (destinatarios.length === 0) return 0;

    // Resolver instancia: env override → primera user_* conectada
    const INSTANCE = INSTANCE_OVERRIDE || await evolutionService.findFirstConnectedInstance() || '';
    if (!INSTANCE) {
      throw new Error('No hay ninguna instancia de WhatsApp conectada. Ve a Conexión WhatsApp y vincula tu número.');
    }
    await evolutionService.ensureInstance(INSTANCE);
    const message = buildMessage(alerta.message_template || alerta.name, alerta);

    // Generar adjunto según tipo de evento o adjunto_tipo
    let pdfAttachment: { base64: string; fileName: string; caption: string } | null = null;

    if (alerta.tipo_evento === 'CIERRE_FACT') {
      try {
        pdfAttachment = await generateCierreFactReport(alerta.client_id || undefined);
        console.log(`[WA-CRON] PDF CierreFact generado: ${pdfAttachment.fileName}`);
      } catch (err: any) {
        console.error('[WA-CRON] Error generando PDF cierre-fact:', err.message);
      }
    } else if (alerta.tipo_evento === 'SOBRECOSTO') {
      try {
        pdfAttachment = await generateSobrecostoReport(alerta.client_id || undefined);
        console.log(`[WA-CRON] PDF Sobrecosto generado: ${pdfAttachment.fileName}`);
      } catch (err: any) {
        console.error('[WA-CRON] Error generando PDF sobrecosto:', err.message);
      }
    } else if (alerta.adjunto_tipo === 'informe_flota') {
      try {
        pdfAttachment = await generateFlotaReportPdf();
        console.log(`[WA-CRON] PDF generado: ${pdfAttachment.fileName}`);
      } catch (err: any) {
        console.error('[WA-CRON] Error generando PDF flota:', err.message);
      }
    }

    let sent = 0;

    for (const dest of destinatarios) {
      const phone = dest.phone_number;
      try {
        // Revalidar la conexión antes de CADA envío, no solo una vez al inicio del lote —
        // en listas largas la sesión puede caerse a mitad de camino sin que nos enteremos.
        const stillOpen = await evolutionService.isInstanceOpen(INSTANCE);
        if (!stillOpen) {
          console.error(`[WA-CRON] La instancia "${INSTANCE}" se desconectó a mitad del envío. Restantes omitidos desde ${phone}.`);
          break;
        }

        if (pdfAttachment) {
          await evolutionService.sendMediaDirect(
            INSTANCE,
            phone,
            pdfAttachment.base64,
            pdfAttachment.fileName,
            `${message}\n\n${pdfAttachment.caption}`
          );
        } else {
          await evolutionService.sendMessageDirect(INSTANCE, phone, message);
        }
        sent++;
        await sleep(5000); // rate limit: 1 msg / 5s — margen más amplio para evitar throttling de WhatsApp
      } catch (err: any) {
        console.error(`[WA-CRON] Error enviando a ${phone}:`, err.message);
      }

      // Correo en paralelo, siempre que el destinatario tenga uno configurado — no bloqueante
      // y no depende de si el WhatsApp de arriba tuvo éxito o no.
      if (dest.email) {
        const rawBase64 = pdfAttachment?.base64.includes(';base64,')
          ? pdfAttachment.base64.split(';base64,')[1]
          : pdfAttachment?.base64;
        sendEmail(
          dest.email,
          `OrbitM7 — ${alerta.name}`,
          buildEmailHtml(alerta, message, pdfAttachment?.caption),
          pdfAttachment && rawBase64 ? [{ filename: pdfAttachment.fileName, content: Buffer.from(rawBase64, 'base64') }] : undefined
        ).catch((err: any) => console.error(`[WA-CRON] Error enviando email a ${dest.email}:`, err.message));
      }
    }

    if (!isTest) {
      await pool.query(
        `UPDATE alertas_whatsapp SET last_run = NOW() WHERE id = $1`,
        [alerta.id]
      ).catch(() => {});
    }

    console.log(`[WA-CRON] Alerta "${alerta.name}" enviada a ${sent}/${destinatarios.length} destinatario(s)`);
    return sent;
  }

  async loadAndSchedule() {
    // Limpiar jobs previos
    for (const [id, task] of activeJobs) {
      task.stop();
      activeJobs.delete(id);
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
        await this.sendAlerta(alerta);
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
