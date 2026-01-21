
import { api } from './api';

export const extractLicenseInfo = async (files: { data: string, mimeType: string }[]) => {
  const prompt = `Analiza licencia de conducción (Colombia). Extrae JSON: {success: true, data: {fullName, documentNumber, category, expiry(AAAA-MM-DD)}}`;
  try {
    const cleanFiles = files.map(f => ({
      data: f.data.includes('base64,') ? f.data.split('base64,')[1] : f.data,
      mimeType: f.mimeType
    }));
    const res = await api.post('/api/ai/analyze', { prompt, files: cleanFiles });
    return JSON.parse(res.text);
  } catch (e) {
    return { success: false, error: "Error en M7 Vision Server." };
  }
};

export const extractVehicleDocInfo = async (file: { data: string, mimeType: string }, expectedPlate: string, docType: 'SOAT' | 'Techno') => {
  const prompt = `Analiza documento ${docType}. Valida placa ${expectedPlate}. Extrae JSON: {plateMatches, plateFound, expiryDate, brand, modelYear}`;
  try {
    const cleanFile = {
      data: file.data.includes('base64,') ? file.data.split('base64,')[1] : file.data,
      mimeType: file.mimeType
    };
    const res = await api.post('/api/ai/analyze', { prompt, files: [cleanFile] });
    return JSON.parse(res.text);
  } catch (e) {
    return { plateMatches: false, error: "Fallo en servidor IA M7." };
  }
};

export const getM7AssistantResponse = async (userMessage: string, chatHistory: any[]) => {
  const prompt = `Eres el asistente oficial de Milla Siete (M7). Responde a: ${userMessage}`;
  try {
    const res = await api.post('/api/ai/analyze', { prompt });
    return res.text;
  } catch (e) {
    return "Servidor M7 fuera de línea temporalmente.";
  }
};

export const suggestOptimalRoute = async (invoices: any[], vehicleCapacity: number) => {
  const prompt = `Organiza estas entregas para un vehículo de ${vehicleCapacity}m3. Facturas: ${JSON.stringify(invoices)}. Responde solo los IDs en orden óptimo.`;
  try {
    const res = await api.post('/api/ai/analyze', { prompt });
    return res.text;
  } catch (e) {
    return "";
  }
};
