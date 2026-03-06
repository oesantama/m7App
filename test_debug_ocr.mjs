
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
    console.log('--- TEST GEMINI OCR (DIAGNOSTICO PROFUNDO) ---');
    
    if (!apiKey) {
        console.error('Error: No API Key found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // TEST 1: PING TEXTO
    try {
        console.log('TEST 1: Ping Texto...');
        const result = await model.generateContent("Ping");
        console.log('TEST 1: OK. (Texto Funciona)');
    } catch (e) {
        console.error('TEST 1: FALLO.', e.toString());
    }

    // TEST 2: BINARIO (PNG) - Generamos un pixel rojo base64
    const redPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    try {
        console.log('TEST 2: Binario (Image/PNG)...');
        const result = await model.generateContent([
            { text: "Que color es esto?" }, 
            { inlineData: { data: redPixel, mimeType: "image/png" } }
        ]);
        console.log('TEST 2: OK. (Imagen Funciona)');
    } catch (e) {
        console.error('TEST 2: FALLO.', e.toString());
    }

    // TEST 3: BINARIO (PDF)
    const pdfFile = 'CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf';
    const pdfPath = path.join(__dirname, pdfFile);
    if (fs.existsSync(pdfPath)) {
        try {
            console.log('TEST 3: Binario (PDF/Buffer)...');
            const pdfData = fs.readFileSync(pdfPath).toString('base64').substring(0, 50000); // Solo un trozo por si es tamaño
            const result = await model.generateContent([
                { text: "Analiza" }, 
                { inlineData: { data: pdfData, mimeType: "application/pdf" } }
            ]);
            console.log('TEST 3: OK. (PDF Funciona)');
        } catch (e) {
            console.error('TEST 3: FALLO.', e.toString());
        }
    } else {
        console.log('TEST 3: OMITIDO (PDF no encontrado)');
    }
}

testGemini();
