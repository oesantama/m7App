
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const aiService = {
  async generateResponse(prompt: string, context?: any) {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('YOUR_GEMINI')) {
        return "⚠️ La IA no está configurada. Por favor define la variable GEMINI_API_KEY en el archivo .env";
      }

      const model = genAI.getGenerativeModel({ model: process.env.AI_MODEL || "gemini-1.5-flash" });

      const systemPrompt = `
      Eres "M7 Intelligence", el asistente virtual avanzado de Milla Siete (M7) - Sistema de Gestión Logística.
      Tu objetivo es ayudar a los usuarios a gestionar operaciones de transporte, almacén y rutas.
      
      CONTEXTO OPERATIVO ACTUAL DEL SISTEMA:
      ${JSON.stringify(context || {}, null, 2)}
      
      INSTRUCCIONES:
      1. Responde de manera profesional, concisa y orientada a la eficiencia logística.
      2. Si el usuario pregunta por datos específicos (vehículos, rutas, documentos), usa el CONTEXTO OPERATIVO proporcionado arriba.
      3. Si no tienes la información en el contexto, indícalo amablemente y ofrece ayuda general.
      4. Puedes sugerir acciones como "Optimizar rutas" o "Validar documentos pendientes" si ves que hay trabajo por hacer en el contexto.
      5. Responde siempre en Español.
      `;

      const result = await model.generateContent([systemPrompt, prompt]);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error("[M7-AI-SERVICE] Error/Quota:", error.message);
      // Fallback amigable en lugar de error 500
      return "Lo siento, mi núcleo de inteligencia está experimentando alta latencia o problemas de credenciales. Intenta más tarde.";
    }
  }
};
