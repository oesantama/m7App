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
      [title, senderName, senderEmail, subject, bodyHtml, targetGroup]
    );
    res.json({ success: true, campaign: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const sendCampaign = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE cyber_phishing_campaigns SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    res.json({ success: true, message: 'Campaña enviada a la cola de distribución.' });
  } catch (err: any) {
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
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await pool.query(
      `INSERT INTO cyber_phishing_events (campaign_id, user_email, event_type, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [campaignId, userEmail, eventType.toUpperCase(), ip, userAgent]
    );

    if (eventType.toUpperCase() === 'OPEN') {
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length });
      res.end(pixel);
    } else {
      res.send("<h1>Sitio no encontrado</h1><p>El enlace al que intenta acceder no está disponible.</p>");
    }
  } catch (err: any) {
    res.status(500).send('Error');
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
