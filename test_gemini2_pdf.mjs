
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function testGemini2() {
    console.log('--- TEST GEMINI 2.0 FLASH (OCR PDF) ---');
    
    if (!apiKey) {
        console.error('Error: No API Key found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // TEST BINARIO (PDF)
    const pdfFile = 'CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf';
    const pdfPath = path.join(__dirname, pdfFile);
    if (fs.existsSync(pdfPath)) {
        try {
            console.log('TEST BINARIO (PDF) con Gemini 2.0 Flash...');
            // Solo tomamos los primeros 100KB del PDF para el test binario directo por si es un tema de payload size
            const pdfData = fs.readFileSync(pdfPath).toString('base64');
            console.log(`PDF Size: ${pdfData.length} chars (base64)`);
            
            const result = await model.generateContent([
                { text: "ACTUA COMO OCR: Extrae el número de documento de esta página. Responde SOLO con el número." }, 
                { inlineData: { data: pdfData, mimeType: "application/pdf" } }
            ]);
            const response = await result.response;
            console.log('OCR Result (2.0 Flash):', response.text());
            console.log('✅ GEMINI 2.0 FLASH LOGRÓ PROCESAR EL PDF.');
        } catch (e) {
            console.error('❌ GEMINI 2.0 FLASH TAMBIÉN FALLÓ:', e.toString());
        }
    } else {
        console.log('TEST OMITIDO (PDF no encontrado)');
    }
}

testGemini2();
