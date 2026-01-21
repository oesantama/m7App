
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Proxy para Gemini (Protege tu API KEY)
app.post('/api/ai/analyze-doc', async (req, res) => {
  try {
    const { prompt, fileData, mimeType } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: fileData, mimeType } }
        ]
      }
    });
    res.json({ text: response.text });
  } catch (error) {
    res.status(500).json({ error: 'Falla en M7 Vision Server' });
  }
});

// Rutas para base de datos (Aquí conectarás PostgreSQL)
app.get('/api/vehicles', (req, res) => {
  // Aquí iría: const vehicles = await db.query('SELECT * FROM vehicles');
  res.json([]); 
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`M7 Backend corriendo en puerto ${PORT}`));
