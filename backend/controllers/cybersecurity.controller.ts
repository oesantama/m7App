import { Request, Response } from 'express';
import { sendEmail } from '../services/notification.service.js';
import pool from '../config/database.js';

// --- INITIALIZE DB TABLES ---
const initializeCyberDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cyber_phishing_campaigns (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        sender_name VARCHAR(255),
        sender_email VARCHAR(255),
        subject VARCHAR(500),
        body_html TEXT,
        target_group TEXT,
        status VARCHAR(50) DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cyber_phishing_events (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES cyber_phishing_campaigns(id),
        user_email VARCHAR(255),
        event_type VARCHAR(50), -- 'OPEN', 'CLICK', 'REPORTED'
        ip_address VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cyber_training_plans (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_url VARCHAR(500),
        required_for_role VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migraciones retrocompatibles (garantizar TEXT para 50+ correos)
      ALTER TABLE cyber_phishing_campaigns ALTER COLUMN target_group TYPE TEXT;
      ALTER TABLE cyber_phishing_campaigns ALTER COLUMN subject TYPE VARCHAR(500);
      ALTER TABLE cyber_phishing_campaigns ALTER COLUMN sender_name TYPE VARCHAR(255);
      ALTER TABLE cyber_phishing_campaigns ALTER COLUMN sender_email TYPE VARCHAR(255);
      ALTER TABLE cyber_phishing_events ALTER COLUMN user_email TYPE VARCHAR(255);
    `);
  } catch (err: any) {
    console.error('[CYBER-DB-INIT]', err.message);
  }
};
initializeCyberDb().catch(console.error);

// Helper: Extraer, desduplicar y sanitizar lista de correos
export function extractValidEmails(input: string): string[] {
  if (!input || input.trim().toUpperCase() === 'TODOS') return [];
  const raw = input.split(/[,;\n\r\t]+/).map(s => s.trim().toLowerCase());
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const unique = Array.from(new Set(raw.filter(e => emailRegex.test(e))));
  return unique;
}

// Helper: Construir plantilla HTML profesional y amigable con filtros Anti-Spam
function buildCleanEmailHtml(bodyContent: string, trackingUrl: string, title: string): string {
  let innerHtml = bodyContent || '';
  const buttonHtml = `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${trackingUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="#dc2626">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">Confirmar / Verificar Identidad</center>
    </v:roundrect>
    <![endif]-->
    <a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" style="background-color:#dc2626;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-family:Arial,Helvetica,sans-serif;font-size:14px;display:inline-block;margin:16px 0;letter-spacing:0.3px;">
      Confirmar / Verificar Identidad &rarr;
    </a>
  `;

  if (!/<[a-z][\s\S]*>/i.test(innerHtml)) {
    innerHtml = innerHtml.replace(/\n/g, '<br />');
  }

  if (innerHtml.includes('{{LINK_BOTON}}')) {
    innerHtml = innerHtml.replace(/\{\{LINK_BOTON\}\}/g, buttonHtml);
  } else {
    innerHtml = `${innerHtml}<br><br><p style="text-align:center;">${buttonHtml}</p>`;
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          <!-- Header Institucional -->
          <tr>
            <td style="padding:20px 28px;background-color:#0f172a;border-bottom:3px solid #dc2626;">
              <table role="presentation" width="100%" border="0">
                <tr>
                  <td style="color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:0.5px;">
                    🛡️ MILLA 7 &bull; SEGURIDAD DE LA INFORMACIÓN
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 20px 28px;color:#334155;font-size:14px;line-height:1.6;">
              ${innerHtml}
            </td>
          </tr>
          <!-- Footer Institucional -->
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5;">
              <p style="margin:0;">Este es un mensaje institucional y confidencial de concientización y seguridad de Milla 7 S.A.S. Cumplimiento estándar BASC V6-2022 / SG-SST.</p>
              <p style="margin:4px 0 0 0;">Si recibió este correo por error, por favor notifíquelo a <a href="mailto:seguridad@millasiete.com" style="color:#64748b;text-decoration:underline;">seguridad@millasiete.com</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- PHISHING CAMPAIGNS ---
export const getCampaigns = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM cyber_phishing_campaigns ORDER BY created_at DESC');
    res.json({ success: true, campaigns: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const { title, senderName, senderEmail, subject, bodyHtml, targetGroup } = req.body;
    const result = await pool.query(
      `INSERT INTO cyber_phishing_campaigns (title, sender_name, sender_email, subject, body_html, target_group) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        title || 'Jornada Preventiva de Ciberseguridad',
        senderName || 'Milla Siete Seguridad TI',
        senderEmail || 'seguridad@millasiete.com',
        subject || '[Milla Siete TI] Comunicación Oficial: Verificación de Seguridad',
        bodyHtml || '',
        targetGroup || 'TODOS'
      ]
    );
    res.json({ success: true, campaign: result.rows[0] });
  } catch (err: any) {
    console.error('[CREATE-CAMPAIGN-ERROR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateCampaign = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, subject, bodyHtml, targetGroup } = req.body;
    const result = await pool.query(
      `UPDATE cyber_phishing_campaigns 
       SET title = $1, subject = $2, body_html = $3, target_group = $4 
       WHERE id = $5 RETURNING *`,
      [title, subject, bodyHtml, targetGroup, id]
    );
    res.json({ success: true, campaign: result.rows[0] });
  } catch (err: any) {
    console.error('[UPDATE-CAMPAIGN-ERROR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM cyber_phishing_events WHERE campaign_id = $1', [id]);
    await pool.query('DELETE FROM cyber_phishing_campaigns WHERE id = $1', [id]);
    res.json({ success: true, message: 'Jornada eliminada correctamente' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const sendCampaign = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaignRes = await pool.query('SELECT * FROM cyber_phishing_campaigns WHERE id = $1', [id]);
    if (campaignRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
    }

    const campaign = campaignRes.rows[0];
    let recipients: string[] = [];

    if (campaign.target_group && campaign.target_group.trim().toUpperCase() !== 'TODOS') {
      recipients = extractValidEmails(campaign.target_group);
    }

    if (recipients.length === 0) {
      const usersRes = await pool.query("SELECT email FROM users WHERE status_id = 'EST-01'");
      recipients = Array.from(new Set(usersRes.rows.map((u: any) => u.email?.trim().toLowerCase()).filter((e: string) => e && e.includes('@'))));
    }

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No se encontraron destinatarios válidos para la campaña.' });
    }

    // Actualizar estado a 'SENDING'
    await pool.query("UPDATE cyber_phishing_campaigns SET status = 'SENDING', sent_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

    const results: Array<{ email: string; success: boolean; messageId?: string; error?: string }> = [];
    const baseUrl = process.env.VITE_API_URL || 'https://orbitm7.m7apps.com';

    // Envío controlado por lotes (Batching & Pacing anti-spam)
    const BATCH_SIZE = 5;
    const PAUSE_BETWEEN_EMAILS_MS = 600; // 600ms entre correos
    const PAUSE_BETWEEN_BATCHES_MS = 2500; // 2.5s cada 5 correos

    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i];
      const trackingUrl = `${baseUrl}/api/cybersecurity/track/${campaign.id}/${encodeURIComponent(email)}/CLICK`;
      const finalHtml = buildCleanEmailHtml(campaign.body_html || '', trackingUrl, campaign.title || 'Seguridad Milla 7');

      try {
        const sendRes = await sendEmail(
          email,
          campaign.subject,
          finalHtml,
          undefined,
          {
            fromName: campaign.sender_name || 'Milla Siete Seguridad TI',
            headers: {
              'X-Priority': '3',
              'X-Campaign-ID': String(campaign.id),
              'X-Mailer': 'OrbitM7-CyberEngine',
              'Precedence': 'bulk',
              'List-Unsubscribe': '<mailto:seguridad@millasiete.com?subject=unsubscribe>'
            }
          }
        );
        console.log(`[CYBER-EMAIL-SUCCESS] (${i + 1}/${recipients.length}) Correo enviado a ${email}: MessageID=${sendRes?.messageId}`);
        results.push({ email, success: true, messageId: sendRes?.messageId });
      } catch (mailErr: any) {
        console.error(`[CYBER-EMAIL-ERROR] (${i + 1}/${recipients.length}) Error enviando a ${email}:`, mailErr.message);
        results.push({ email, success: false, error: mailErr.message });
      }

      // Control de flujo anti-spam entre envíos
      if (i < recipients.length - 1) {
        if ((i + 1) % BATCH_SIZE === 0) {
          console.log(`[CYBER-EMAIL-PACING] Pausa de ${PAUSE_BETWEEN_BATCHES_MS}ms tras lote de ${BATCH_SIZE} correos...`);
          await sleep(PAUSE_BETWEEN_BATCHES_MS);
        } else {
          await sleep(PAUSE_BETWEEN_EMAILS_MS);
        }
      }
    }

    const failedCount = results.filter(r => !r.success).length;
    const successCount = results.filter(r => r.success).length;

    await pool.query("UPDATE cyber_phishing_campaigns SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

    if (failedCount > 0 && successCount === 0) {
      return res.status(500).json({
        success: false,
        error: `Error al enviar correos: ${results[0]?.error || 'Error en servidor de correo'}`
      });
    }

    res.json({
      success: true,
      message: failedCount > 0
        ? `Envío controlado completado: ${successCount} entregados con éxito, ${failedCount} fallaron.`
        : `Campaña distribuida exitosamente y de forma controlada a ${successCount} destinatario(s) sin alertas de spam.`,
      stats: {
        total: recipients.length,
        delivered: successCount,
        failed: failedCount
      },
      results
    });
  } catch (err: any) {
    console.error('[CYBER-SEND-FATAL]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getCampaignStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT event_type, COUNT(*) as count 
      FROM cyber_phishing_events 
      WHERE campaign_id = $1 
      GROUP BY event_type
    `, [id]);
    
    const eventsQuery = await pool.query(`
      SELECT * FROM cyber_phishing_events WHERE campaign_id = $1 ORDER BY created_at DESC
    `, [id]);

    res.json({ 
      success: true, 
      stats: result.rows,
      recentEvents: eventsQuery.rows 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Tracking Endpoint (Pixel or Link Click)
export const trackPhishingEvent = async (req: Request, res: Response) => {
  try {
    const { campaignId, userEmail, eventType } = req.params;
    const eventTypeStr = String(eventType || '').toUpperCase();
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await pool.query(
      `INSERT INTO cyber_phishing_events (campaign_id, user_email, event_type, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [campaignId, userEmail, eventTypeStr, ip, userAgent]
    );

    if (eventTypeStr === 'OPEN') {
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length });
      res.end(pixel);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulacro de Ciberseguridad | Milla Siete S.A.S.</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #020617;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background-color: #0f172a;
      border: 1px solid #334155;
      border-radius: 24px;
      max-width: 550px;
      width: 90%;
      padding: 40px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .icon-badge {
      width: 72px;
      height: 72px;
      background-color: rgba(245, 158, 11, 0.1);
      border: 2px solid rgba(245, 158, 11, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 {
      font-size: 22px;
      font-weight: 900;
      color: #ffffff;
      margin: 0 0 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    p.subtitle {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .tips-box {
      background-color: #020617;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 20px;
      text-align: left;
      margin-bottom: 24px;
    }
    .tips-header {
      font-size: 11px;
      font-weight: 800;
      color: #f59e0b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      color: #cbd5e1;
      font-size: 13px;
      line-height: 1.8;
    }
    .footer {
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #1e293b;
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      color: #34d399;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">🛡️</div>
    <h1>¡Ejercicio Preventivo de Ciberseguridad!</h1>
    <p class="subtitle">
      Este enlace forma parte de una <strong>jornada preventiva de concientización y evaluación en ciberseguridad</strong> organizada por la Dirección de TI de Milla Siete S.A.S.
    </p>

    <div class="tips-box">
      <div class="tips-header">Recomendaciones de Seguridad TI</div>
      <ul>
        <li>Verifique la dirección de correo real del remitente antes de interactuar.</li>
        <li>Evite hacer clic en enlaces o botones dentro de mensajes no esperados.</li>
        <li>Inspeccione las URL destino pasando el cursor sobre los botones o enlaces.</li>
        <li>Reporte cualquier mensaje inusual a <strong>directorti@millasiete.com</strong>.</li>
      </ul>
    </div>

    <div class="footer">
      <span>Cumplimiento BASC V6-2022 — Cap. 6</span>
      <span class="badge">✓ Registro Confirmado</span>
    </div>
  </div>
</body>
</html>
      `);
    }
  } catch (err: any) {
    res.status(500).send('Error al procesar la solicitud.');
  }
};

// --- TRAINING PLANS ---
export const getTrainingPlans = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM cyber_training_plans ORDER BY created_at DESC');
    res.json({ success: true, plans: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createTrainingPlan = async (req: Request, res: Response) => {
  try {
    const { title, description, requiredForRole } = req.body;
    let fileUrl = '';
    if (req.file) {
      fileUrl = '/uploads/' + req.file.filename;
    }
    
    const result = await pool.query(
      `INSERT INTO cyber_training_plans (title, description, file_url, required_for_role) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, description, fileUrl, requiredForRole]
    );
    res.json({ success: true, plan: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- GLOBAL METRICS ---
export const getGlobalMetrics = async (req: Request, res: Response) => {
  try {
    const totalEventsRes = await pool.query('SELECT COUNT(*) FROM cyber_phishing_events');
    const clicksRes = await pool.query("SELECT COUNT(*) FROM cyber_phishing_events WHERE event_type = 'CLICK'");
    const recentEventsRes = await pool.query(`
      SELECT e.user_email, e.event_type, e.created_at, c.title as campaign_title 
      FROM cyber_phishing_events e 
      LEFT JOIN cyber_phishing_campaigns c ON e.campaign_id = c.id 
      ORDER BY e.created_at DESC LIMIT 10
    `);

    const totalEvents = parseInt(totalEventsRes.rows[0]?.count || '0');
    const totalClicks = parseInt(clicksRes.rows[0]?.count || '0');
    const fallRate = totalEvents > 0 ? ((totalClicks / totalEvents) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      metrics: {
        totalEvents,
        totalClicks,
        fallRate: `${fallRate}%`,
        recentEvents: recentEventsRes.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
