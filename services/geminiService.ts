
import { GoogleGenAI, Type } from "@google/genai";

// Fix: Creating instance inside each function to ensure the latest API key is used as per guidelines.
export const suggestOptimalRoute = async (invoices: any[], vehicleCapacity: number) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Como experto logístico M7, organiza: Capacidad ${vehicleCapacity}m3. Facturas: ${JSON.stringify(invoices.map(i => ({ id: i.id, vol: i.volumeM3, address: i.address })))}. Responde SOLO el orden de IDs separado por comas.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    // Fix: Access .text property directly (not a method).
    return response.text?.trim() || "";
  } catch (error) {
    return "";
  }
};

export const extractLicenseInfo = async (files: { data: string, mimeType: string }[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Prompt optimized for Colombian licenses
  const prompt = `Analiza detalladamente esta(s) imagen(es) de una licencia de conducción (Colombia). 
  Busca en el frente el nombre y número de documento. En el reverso busca la tabla de categorías y vigencias.
  EXTRAE LOS SIGUIENTES DATOS EN FORMATO JSON.`;

  try {
    const parts = files.map(f => ({
      inlineData: { 
        data: f.data.includes('base64,') ? f.data.split('base64,')[1] : f.data, 
        mimeType: f.mimeType 
      }
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }, ...parts] },
      config: { 
        temperature: 0.1,
        responseMimeType: "application/json",
        // Fix: Added responseSchema for more reliable structured output.
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN },
            error: { type: Type.STRING },
            data: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                documentNumber: { type: Type.STRING },
                category: { type: Type.STRING },
                expiry: { type: Type.STRING, description: 'Format AAAA-MM-DD' }
              },
              required: ["fullName", "documentNumber", "category", "expiry"]
            }
          },
          required: ["success", "data"]
        }
      }
    });
    
    // Fix: Access .text property directly.
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return { 
      success: false, 
      error: "M7 VISION: No se pudo interpretar el documento. Asegúrate de que las fotos no tengan reflejos y el texto sea nítido." 
    };
  }
};

export const extractVehicleDocInfo = async (file: { data: string, mimeType: string }, expectedPlate: string, docType: 'SOAT' | 'Techno') => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analiza este documento de ${docType === 'SOAT' ? 'SOAT (Seguro)' : 'Revisión Técnico-Mecánica'}.
  TU TAREA:
  1. Extraer la PLACA (alfanumérico sin espacios).
  2. Extraer la FECHA DE VENCIMIENTO (AAAA-MM-DD).
  ${docType === 'SOAT' ? '3. Extraer MARCA del vehículo.\n4. Extraer AÑO MODELO (4 dígitos).' : ''}
  5. Validar si la placa encontrada coincide con "${expectedPlate}".`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              data: file.data.includes('base64,') ? file.data.split('base64,')[1] : file.data, 
              mimeType: file.mimeType 
            } 
          }
        ]
      },
      config: { 
        temperature: 0.1,
        responseMimeType: "application/json",
        // Fix: Added responseSchema for structured output.
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plateMatches: { type: Type.BOOLEAN },
            plateFound: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            brand: { type: Type.STRING },
            modelYear: { type: Type.NUMBER }
          },
          required: ["plateMatches", "plateFound", "expiryDate"]
        }
      }
    });
    
    // Fix: Access .text property directly.
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error) {
    return { plateMatches: false, error: "Error de lectura en M7 Vision." };
  }
};

export const getM7AssistantResponse = async (userMessage: string, chatHistory: any[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `Eres el asistente de Milla Siete (M7). Responde breve y profesional.`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: { 
        systemInstruction, 
        temperature: 0.5 
      }
    });

    // Fix: chat.sendMessage returns a GenerateContentResponse; access .text directly.
    const response = await chat.sendMessage({ message: userMessage });
    return response.text;
  } catch (error) {
    return "Error de conexión.";
  }
};
