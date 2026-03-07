
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * M7 INTELLIGENCE - NÚCLEO DE IA
 * Refactorizado para máxima resiliencia y priorización de .env
 */

// Función para obtener el pool de API Keys desde el CSV (Sincronizado con Grupo Inter)
const getAPIKeysPool = (): string[] => {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    return rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

let currentKeyIndex = 0; 

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
    const keys = getAPIKeysPool();
    const key = keys[currentKeyIndex % keys.length];
    
    if (!key) {
        console.error("[M7-AI] CRÍTICO: No se encontraron API KEYS válidas en el pool.");
        throw new Error("API Pool vacío");
    }

    const keyForLog = key.substring(0, 4) + '...' + key.substring(key.length - 4);
    console.log(`[M7-AI] 🔑 Usando Key [${(currentKeyIndex % keys.length) + 1}/${keys.length}]: ${keyForLog}`);
    
    return new GoogleGenerativeAI(key);
  },

  rotateKey() {
    const keys = getAPIKeysPool();
    currentKeyIndex++;
    console.log(`[M7-AI] 🔄 Rotando a la siguiente llave del pool [${(currentKeyIndex % keys.length) + 1}/${keys.length}].`);
  },

  async saveLearning(rule: string) {
      const knowledge = getKnowledgeBase();
      knowledge.push({ rule, date: new Date().toISOString(), approved: true });
      fs.writeFileSync(KNOWLEDGE_BASE_PATH, JSON.stringify(knowledge, null, 2));
      return true;
  },

  async generateResponse(prompt: string, context?: any) {
    const keys = getAPIKeysPool();
    const maxGlobalAttempts = keys.length; 
    let lastErrorDetails = "";

    const knowledgeRules = getKnowledgeBase().map((k: any) => `- ${k.rule}`).join('\n');

    const systemPrompt = `
    Eres "OrbitM7 Intelligence" (OrbitM7 IQ), el asistente experto de Milla 7.
    Tu MISIÓN es asistir EXCLUSIVAMENTE sobre el uso de la aplicación OrbitM7 y sus procesos logísticos internos.
    
    REGLAS DE ORO:
    1. SOLO RESPONDES sobre temas de la aplicación Milla 7: Menús, submenús, procesos de inventario, despachos, auditoría, asignaciones, etc. 
    2. Si te preguntan algo fuera de la aplicación (ej. "¿Cómo está el clima?"), responde educadamente que tu especialidad es OrbitM7.
    3. GUÍA POR MENÚS: Indica siempre la ruta (ej: "Puedes encontrar esto en el menú Despachos > Alistado").
    4. FOCO OPERATIVO: Explica procesos como "Recibido de Material", "Consolidación de Carga", "Planeación de Rutas" y "Gestión de Grupo Inter (OCR)".

    REGLAS TÉCNICAS:
    - NO USES IDs INTERNOS (ej. VEH-001). Usa nombres legibles (Placas, Nombres de conductores).
    - Sé proactivo con los datos del contexto operativo.
    - Mantén un tono profesional, experto y conciso.

    CONTEXTO OPERATIVO ACTUAL:
    ${JSON.stringify(context || {}, null, 2)}
    `;

    const configurations = [
        { model: "gemini-2.0-flash" }
    ];

    let attempts = 0;
    while (attempts < maxGlobalAttempts) {
        try {
            const keys = getAPIKeysPool();
            const genAI = this.getClient();
            const currentKeyLabel = `(Key ${currentKeyIndex % keys.length + 1}/${keys.length})`;

            for (const config of configurations) {
                try {
                    console.log(`[M7-AI] Intento con Llave ${currentKeyLabel} | Modelo: ${config.model}`);
                    const modelIA = genAI.getGenerativeModel({ 
                        model: config.model,
                        systemInstruction: systemPrompt 
                    });
                    
                    const result = await modelIA.generateContent(prompt);
                    const response = await result.response;
                    const text = response.text();
                    
                    if (text) return text;
                } catch (innerError: any) {
                    lastErrorDetails = (innerError.message || '').toLowerCase();
                    
                    // Si es error de cuota (429), esperar un poco antes de rotar
                    if (lastErrorDetails.includes('429') || lastErrorDetails.includes('quota')) {
                        console.warn(`[M7-AI] Cuota excedida para ${config.model}. Pausa estratégica de 5s...`);
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }

                    if (lastErrorDetails.includes('method') || lastErrorDetails.includes('support')) {
                        console.warn(`[M7-AI] Modelo ${config.model} no compatible. Probando siguiente.`);
                        continue;
                    }

                    if (lastErrorDetails.includes('key')) {
                        console.warn(`[M7-AI] Llave inválida detectada.`);
                        break; 
                    }
                }
            }
            
            // Si todo el pool falla (ej. OCR masivo en paralelo), pausa nuclear
            if (attempts > 0 && (attempts % keys.length === 0)) {
                console.log(`[M7-AI] Pool saturado. Espera nuclear de 20s...`);
                await new Promise(r => setTimeout(r, 20000));
            }

            this.rotateKey();
            attempts++;

        } catch (e: any) {
            console.error(`[M7-AI] Error en ciclo: ${e.message}`);
            this.rotateKey();
            attempts++;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    return `M7 IQ Error: No se pudo establecer conexión con los modelos de IA tras agotar todas las llaves y configuraciones. 
Detalle técnico: ${lastErrorDetails || 'Servicio no disponible'}. 
Por favor, verifique que su GEMINI_API_KEY en .env sea válida y tenga la API habilitada.`;
  }
};
