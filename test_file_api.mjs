
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function testFileApi() {
    console.log('--- TEST GOOGLE AI FILE API ---');
    
    if (!apiKey) {
        console.error('Error: No API Key found in .env');
        return;
    }

    try {
        const fileManager = new GoogleAIFileManager(apiKey);
        const pdfFile = 'CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf';
        const pdfPath = path.join(__dirname, pdfFile);

        if (!fs.existsSync(pdfPath)) {
            console.error('PDF no encontrado:', pdfFile);
            return;
        }

        console.log('Subiendo archivo via File API...');
        // El uploadFile requiere un path real
        const uploadResponse = await fileManager.uploadFile(pdfPath, {
            mimeType: "application/pdf",
            displayName: "Test PDF M7",
        });

        console.log(`Archivo subido: ${uploadResponse.file.name} (URI: ${uploadResponse.file.uri})`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log('Procesando documento con el modelo...');
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri
                }
            },
            { text: "Extrae el número de documento de la primera página. Responde solo el número." },
        ]);

        const response = await result.response;
        console.log('OCR Result (File API):', response.text());
        console.log('✅ TEST FILE API EXITOSO.');

        // Limpiar (opcional, Google los borra en 48h)
        // await fileManager.deleteFile(uploadResponse.file.name);

    } catch (error) {
        console.error('❌ ERROR EN FILE API:', error.toString());
    }
}

testFileApi();
