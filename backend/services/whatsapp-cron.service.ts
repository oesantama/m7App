import cron from 'node-cron';
import pool from '../config/database.js';
import { evolutionService } from './evolution.service.js';
import { generateFlotaReportPdf } from './flota-wa-report.service.js';
import { generateCierreFactReport } from './cierre-fact-report.service.js';
import { generateSobrecostoReport } from './sobrecosto-report.service.js';

// Nombre de instancia fijo se resuelve dinámicamente al momento de enviar
const INSTANCE_OVERRIDE = process.env.WA_ALERTS_INSTANCE || '';

interface AlertaWA {
  id: string;
  name: string;
  message_template: string;
  phone_numbers: string[];
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

class WhatsAppCronRunner {
  async sendAlerta(alerta: AlertaWA, isTest = false): Promise<number> {
    const phones = alerta.phone_numbers || [];
    if (phones.length === 0) return 0;

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

    for (const phone of phones) {
      try {
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
        await sleep(3000); // rate limit: 1 msg / 3s
      } catch (err: any) {
        console.error(`[WA-CRON] Error enviando a ${phone}:`, err.message);
      }
    }

    if (!isTest) {
      await pool.query(
        `UPDATE alertas_whatsapp SET last_run = NOW() WHERE id = $1`,
        [alerta.id]
      ).catch(() => {});
    }

    console.log(`[WA-CRON] Alerta "${alerta.name}" enviada a ${sent}/${phones.length} destinatario(s)`);
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
