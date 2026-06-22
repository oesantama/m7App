import { AIOrchestrator } from './ai-orchestrator/orchestrator.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Base de Conocimiento
const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), 'ai_knowledge.json');

const getKnowledgeBase = () => {
    try {
        if (fs.existsSync(KNOWLEDGE_BASE_PATH)) {
            return JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error("[M7-AI] Error leyendo base de conocimiento", e);
    }
    return [];
};

export const aiService = {
  
  getClient() {
    console.warn("[M7-AI] getClient() deprecado. Toda la orquestación de clientes es interna en AIOrchestrator.");
    return null;
  },

  rotateKey() {
    console.warn("[M7-AI] rotateKey() deprecado. AIOrchestrator maneja la rotación de cuotas automáticamente.");
  },

  async saveLearning(rule: string) {
      const knowledge = getKnowledgeBase();
      knowledge.push({ rule, date: new Date().toISOString(), approved: true });
      fs.writeFileSync(KNOWLEDGE_BASE_PATH, JSON.stringify(knowledge, null, 2));
      return true;
  },

  async generateResponse(prompt: string, context?: any) {
    const knowledgeRules = getKnowledgeBase().map((k: any) => `- ${k.rule}`).join('\n');

    const systemPrompt = `
    Eres "OrbitM7 Intelligence" (OrbitM7 IQ), el asistente experto de Milla 7.
    Tu MISIÓN es asistir EXCLUSIVAMENTE sobre el uso de la aplicación OrbitM7 y sus procesos logísticos internos.
    
    REGLAS DE ORO:
    1. SOLO RESPONDES sobre temas de la aplicación Milla 7: Menús, submenús, procesos de inventario, despachos, auditoría, asignaciones, etc. 
    2. Si te preguntan algo fuera de la aplicación (ej. "¿Cómo está el clima?"), responde educadamente que tu especialidad es OrbitM7.
    3. GUÍA POR MENÚS: Indica siempre la ruta (ej: "Puedes encontrar esto en el menú Despachos > Alistado").
    4. FOCO OPERATIVO: Explica procesos como "Recibido de Material", "Consolidación de Carga", "Planeación de Rutas" y "Gestión de Grupo Inter (OCR)".

    REGLAS ADICIONALES (Base de Conocimiento Aprendido):
    ${knowledgeRules}

    REGLAS TÉCNICAS:
    - NO USES IDs INTERNOS (ej. VEH-001). Usa nombres legibles (Placas, Nombres de conductores).
    - Sé proactivo con los datos del contexto operativo.
    - Mantén un tono profesional, experto y conciso.

    CONTEXTO OPERATIVO ACTUAL:
    ${JSON.stringify(context || {}, null, 2)}
    `;

    try {
        const result = await AIOrchestrator.execute({
            prompt,
            context,
            systemInstruction: systemPrompt,
            taskType: 'chat'
        });
        return result.text;
    } catch (e: any) {
        console.error("[M7-AI] Error orquestando respuesta de chat:", e);
        return `M7 IQ Error: No se pudo establecer conexión con los modelos de IA orquestados. Detalle técnico: ${e.message || e}`;
    }
  }
};
