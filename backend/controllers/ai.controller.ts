
import { Request, Response } from 'express';
import { aiService } from '../services/ai.service.js';

export const aiController = {
  async chat(req: Request, res: Response) {
    try {
      const { prompt, context } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Falta el prompt del usuario" });
      }
      
      console.log(`[M7-AI] Recibida consulta: ${prompt.substring(0, 50)}...`);
      const response = await aiService.generateResponse(prompt, context);
      
      res.json({ success: true, response });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async learn(req: Request, res: Response) {
    try {
        const { rule } = req.body;
        if (!rule) return res.status(400).json({ error: "Regla requerida" });
        
        await aiService.saveLearning(rule);
        res.json({ success: true, message: "Conocimiento integrado al núcleo de M7 IQ" });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
  }
};
