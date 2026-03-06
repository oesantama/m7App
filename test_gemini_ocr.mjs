
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function testGemini() {
    console.log('--- TEST GEMINI OCR (ESM) ---');
    console.log('API Key:', apiKey ? (apiKey.substring(0, 5) + '...') : 'MISSING');
    
    if (!apiKey) {
        console.error('Error: No API Key found in .env');
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Usar un modelo básico para el primer ping
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log('Intentando generar contenido simple...');
        const result = await model.generateContent("Hola, responde 'OK' si recibes esto.");
        const response = await result.response;
        console.log('Respuesta:', response.text());
        console.log('✅ Conexión con Gemini EXITOSA.');

        // Test con PDF real si existe
        // PRECAUCIÓN: El nombre del archivo tiene espacios extra
        const pdfFile = 'CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf';
        const pdfPath = path.join(__dirname, pdfFile);
        
        if (fs.existsSync(pdfPath)) {
            console.log(`PDF detectado: ${pdfFile}. Probando OCR...`);
            const pdfBuffer = fs.readFileSync(pdfPath);
            const base64Page = pdfBuffer.toString('base64');
            const prompt = "Actúa como un motor OCR de alta precisión. Analiza esta imagen de una factura/remisión. Extrae exclusivamente el NÚMERO DE DOCUMENTO. Responde SOLO con el número.";
            
            const ocrResult = await model.generateContent([
                { text: prompt },
                { inlineData: { data: base64Page, mimeType: "application/pdf" } }
            ]);
            
            const ocrResponse = await ocrResult.response;
            console.log('OCR Result:', ocrResponse.text());
            console.log('✅ OCR con PDF EXITOSO.');
        } else {
            console.log('⚠️ PDF no encontrado en la raíz para prueba extendida. Archivo buscado:', pdfFile);
        }

    } catch (error) {
        console.error('❌ ERROR EN TEST:', error.toString());
        if (error.status === 403 || (error.message && error.message.includes('403'))) {
            console.error('ERROR 403: Indica que la API Key es inválida o no tiene permisos.');
        }
    }
}

testGemini();
