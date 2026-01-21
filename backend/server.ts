
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Conexión a Base de Datos de DigitalOcean
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Fix: Initialize GoogleGenAI using the API key directly from process.env as per the SDK guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_NAME = process.env.AI_MODEL || 'gemini-3-flash-preview';

// --- MIDDLEWARE DE LOGS M7 ---
app.use((req, res, next) => {
  console.log(`[M7-LOG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- ENDPOINTS DE IA (PROXY) ---
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { prompt, files } = req.body;
    // Fix: Explicitly type 'parts' as an array of any to allow mixed part types (text and inlineData) and prevent TS errors.
    const parts: any[] = [{ text: prompt }];
    
    if (files && files.length > 0) {
      files.forEach((f: any) => {
        parts.push({ inlineData: { data: f.data, mimeType: f.mimeType } });
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts }
    });
    
    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error IA Server:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- ENDPOINTS OPERATIVOS ---

// Obtener Documentos L con sus Items
app.get('/api/documents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
      (SELECT json_agg(i.*) FROM document_items i WHERE i.document_id = d.id) as items
      FROM documents_l d
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Falla DB M7" });
  }
});

// Sincronizar Inventario (Cierre de Conteo Ciego)
app.post('/api/documents/sync-inventory', async (req, res) => {
  const { docId, items, user, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Actualizar cabecera
    await client.query(`
      UPDATE documents_l 
      SET status = 'Inventariado', inventory_date = NOW(), inventory_user = $1, inventory_notes = $2
      WHERE id = $3
    `, [user, notes, docId]);

    // Actualizar conteos por item
    for (const item of items) {
      await client.query(`
        UPDATE document_items 
        SET count_1 = $1, count_2 = $2, notes = $3 
        WHERE document_id = $4 AND article_id = $5
      `, [item.count1, item.count2, item.inventoryNote, docId, item.articleId]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Error de sincronización" });
  } finally {
    client.release();
  }
});

// Gestión de Vehículos
app.get('/api/vehicles', async (req, res) => {
  const result = await pool.query('SELECT * FROM vehicles ORDER BY plate ASC');
  res.json(result.rows);
});

app.post('/api/vehicles', async (req, res) => {
  const v = req.body;
  await pool.query(`
    INSERT INTO vehicles (id, plate, brand, owner, capacity_m3, client_id, soat_expiry, techno_expiry)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [v.id, v.plate, v.brand, v.owner, v.capacityM3, v.clientId, v.soatExpiry, v.technoExpiry]);
  res.json({ success: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[M7-SYSTEM] Servidor operacional en puerto ${PORT}`));
