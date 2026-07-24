import { Request, Response } from 'express';
import pool from '../config/database.js';

// --- INITIALIZE DB TABLES ---
const initializeCyberDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cyber_phishing_campaigns (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      sender_name VARCHAR(100),
      sender_email VARCHAR(100),
      subject VARCHAR(255),
      body_html TEXT,
      target_group VARCHAR(100),
      status VARCHAR(50) DEFAULT 'DRAFT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cyber_phishing_events (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES cyber_phishing_campaigns(id),
      user_email VARCHAR(100),
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
  `);
};
initializeCyberDb().catch(console.error);

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

    if (campaign.target_group && campaign.target_group !== 'TODOS') {
      recipients = campaign.target_group.split(',').map((e: string) => e.trim()).filter((e: string) => e.includes('@'));
    }

    if (recipients.length === 0) {
      const usersRes = await pool.query('SELECT email FROM users WHERE status_id = \'EST-01\'');
      recipients = usersRes.rows.map((u: any) => u.email).filter(Boolean);
    }

    const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
    const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 465);
    const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;

    console.log(`[CYBER-SMTP-DEBUG] Config: Host=${host}, Port=${port}, Secure=${secure}, User=${user}, Recipients=${recipients.join(',')}`);

    if (host && recipients.length > 0) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      for (const email of recipients) {
        const baseUrl = process.env.VITE_API_URL || 'https://orbitm7.m7apps.com';
        const trackingUrl = `${baseUrl}/api/cybersecurity/track/${campaign.id}/${encodeURIComponent(email)}/CLICK`;

        let finalHtml = campaign.body_html || '';
        const buttonHtml = `<a href="${trackingUrl}" style="background:#0f7b6c; color:white; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block; margin: 15px 0;">Verificar Información</a>`;

        if (finalHtml.includes('{{LINK_BOTON}}')) {
          finalHtml = finalHtml.replace(/\{\{LINK_BOTON\}\}/g, trackingUrl);
        } else {
          finalHtml = `${finalHtml}<br><br><p>${buttonHtml}</p>`;
        }

        try {
          const info = await transporter.sendMail({
            from: `"Milla Siete TI" <${user || 'soporte@qinspecting.com'}>`,
            to: email,
            subject: campaign.subject,
            html: finalHtml,
          });
          console.log(`[CYBER-SMTP-SUCCESS] Correo enviado a ${email}: MessageID=${info.messageId}`);
        } catch (mailErr: any) {
          console.error(`[CYBER-SMTP-ERROR] Error enviando a ${email}:`, mailErr.message);
        }
      }
    } else {
      console.warn(`[CYBER-SMTP-WARN] No se intentó el envío. Host=${host}, Destinatarios=${recipients.length}`);
    }

    await pool.query("UPDATE cyber_phishing_campaigns SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    res.json({ success: true, message: `Campaña distribuida exitosamente a ${recipients.length} destinatario(s).` });
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
