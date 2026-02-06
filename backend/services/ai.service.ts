
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * M7 INTELLIGENCE - NÚCLEO DE IA
 * Refactorizado para máxima resiliencia y priorización de .env
 */

// Llaves de respaldo (Fallbacks si la de .env falla por cuota)
const FALLBACK_KEYS = [
  'AIzaSyBC6ld9KnWgM-ALBudnRhGvmzSgGqQf-jc',
  'AIzaSyDjP0a_RGCc4bSbTInqez0PteW7b4oGVJk',
  'AIzaSyA2-8G54aO1TbTRb5gAq_vTjwUQHWU0-U4'
];

let currentKeyIndex = -1; // -1 significa usar la del .env primero

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
    // Intentar .env primero, luego fallbacks
    let key = process.env.GEMINI_API_KEY;
    
    if (currentKeyIndex >= 0) {
        key = FALLBACK_KEYS[currentKeyIndex];
    }

    if (!key) {
        console.error("[M7-AI] CRÍTICO: No se encontró API KEY en .env ni fallbacks válidos.");
        throw new Error("API Key faltante");
    }

    return new GoogleGenerativeAI(key);
  },

  rotateKey() {
    if (currentKeyIndex < FALLBACK_KEYS.length - 1) {
        currentKeyIndex++;
        console.log(`[M7-AI] 🔄 Rotando a llave de respaldo #${currentKeyIndex + 1}.`);
    } else {
        console.warn("[M7-AI] ⚠️ Todas las llaves (incluyendo fallbacks) han sido agotadas.");
    }
  },

  async saveLearning(rule: string) {
      const knowledge = getKnowledgeBase();
      knowledge.push({ rule, date: new Date().toISOString(), approved: true });
      fs.writeFileSync(KNOWLEDGE_BASE_PATH, JSON.stringify(knowledge, null, 2));
      return true;
  },

  async generateResponse(prompt: string, context?: any) {
    let attempts = 0;
    const maxGlobalAttempts = FALLBACK_KEYS.length + 1; 
    let lastErrorDetails = "";

    const knowledgeRules = getKnowledgeBase().map((k: any) => `- ${k.rule}`).join('\n');

    const systemPrompt = `
    Eres "M7 Intelligence" (M7 IQ), el núcleo de inteligencia artificial AUTÓNOMO y REGENERATIVO de Milla Siete (M7).
    Tu especialidad es la optimización logística, gestión de flotas y auditoría de documentos de transporte.
    
    TUS CAPACIDADES:
    1. Aprender del usuario. Si detectas una regla implícita, propón guardarla con [[LEARN: <regla>]].
    2. Asistir en la logística y gestión con máxima eficiencia.
    3. Responder de forma concisa y profesional.

    REGLAS CRÍTICAS DE COMUNICACIÓN (HUMANIZACIÓN):
    - NO USES IDs INTERNOS (ej. VEH-001, v-1770..., USR-05). Al usuario final NO le sirven y NO los conoce.
    - USA SIEMPRE nombres legibles que encuentres en el contexto:
      * Para Vehículos: Usa la placa (ej. "SPN139").
      * Para Conductores: Usa el nombre completo y/o cédula.
      * Para Documentos: Usa el 'externalDocId' (ej. "L010904166").
    - Si solo tienes un ID y no el nombre, di "un vehículo asignado" o similar en lugar de mostrar el código técnico.
    - Sé proactivo con los datos que conoces, no solo menciones que están en un objeto técnico (ej. no digas "en recentAssignments", di "en las últimas asignaciones").

    BASE DE CONOCIMIENTO:
    ${knowledgeRules}

    CONTEXTO OPERATIVO:
    ${JSON.stringify(context || {}, null, 2)}
    `;

    // Modelos estables de Google Gemini - Priorizando 1.5 para estabilidad de cuota
    const configurations = [
        { model: "gemini-1.5-flash" },
        { model: "gemini-2.0-flash" },
        { model: "gemini-2.5-flash" },
        { model: "models/gemini-1.5-flash" },
        { model: "gemini-1.5-pro" }
    ];

    while (attempts < maxGlobalAttempts) {
        try {
            const genAI = this.getClient();
            const currentKeyLabel = currentKeyIndex === -1 ? "(.env)" : `(fallback #${currentKeyIndex + 1})`;

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
                    lastErrorDetails = innerError.message;
                    // Si es un error de "Method not supported", avisar pero seguir probando otros modelos
                    if (lastErrorDetails.includes('method') || lastErrorDetails.includes('support')) {
                        console.warn(`[M7-AI] Modelo ${config.model} no compatible con esta llave/región. Probando siguiente.`);
                        continue;
                    }
                    // Si es cuota agotada para ESTE modelo, intentar el siguiente modelo antes de rotar la llave
                    if (lastErrorDetails.includes('429') || lastErrorDetails.includes('quota')) {
                        console.warn(`[M7-AI] Cuota excedida para ${config.model}. Intentando siguiente modelo con la misma llave.`);
                        continue; // Intentar gemini-1.5 o pro
                    }
                    // Si es llave inválida o error crítico de llave, salir del bucle de modelos para rotar llave
                    if (lastErrorDetails.includes('key')) {
                        console.warn(`[M7-AI] Llave actual inválida: ${lastErrorDetails}`);
                        break; 
                    }
                }
            }
            
            // Si salimos del bucle de modelos sin éxito, rotamos llave
            this.rotateKey();
            attempts++;

        } catch (e: any) {
            console.error(`[M7-AI] Error crítico en servicio: ${e.message}`);
            this.rotateKey();
            attempts++;
        }
    }

    return `M7 IQ Error: No se pudo establecer conexión con los modelos de IA tras agotar todas las llaves y configuraciones. 
Detalle técnico: ${lastErrorDetails || 'Servicio no disponible'}. 
Por favor, verifique que su GEMINI_API_KEY en .env sea válida y tenga la API habilitada.`;
  }
};
