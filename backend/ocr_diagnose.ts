import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFDocument } from 'pdf-lib';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT || '5432'),
});

const getAPIKeysPool = () => {
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    return rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

let currentKeyIndex = 0;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getVisionModel = (modelName?: string, forceApiKey?: string) => {
    const keys = getAPIKeysPool();
    const apiKey = forceApiKey || keys[currentKeyIndex % keys.length] || '';
    const modelId = modelName || process.env.AI_MODEL || "gemini-1.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: modelId });
};

async function generateContentWithRetry(model: any, promptData: any, maxRetries = 5) {
    const keys = getAPIKeysPool();
    let localModel = model;
    let poolTrialCount = 0;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await localModel.generateContent(promptData);
            return result;
        } catch (error: any) {
            const errorStr = (error.toString() + (error.message || '')).toLowerCase();
            const isQuotaError = errorStr.includes('429') || error.status === 429 || errorStr.includes('quota');
            
            if (isQuotaError && i < maxRetries - 1) {
                currentKeyIndex++;
                poolTrialCount++;
                const nextKey = keys[currentKeyIndex % keys.length];
                console.log(`[DIAGNOSE] ⚠️ Cuota excedida. Rotando a Key ${currentKeyIndex % keys.length + 1}...`);
                
                if (poolTrialCount >= keys.length) {
                    console.log(`[DIAGNOSE] 🚨 Pool agotado. Esperando 20s...`);
                    await sleep(20000);
                    poolTrialCount = 0;
                } else {
                    await sleep(3000);
                }
                
                localModel = getVisionModel();
                continue;
            }
            throw error;
        }
    }
}

async function runDiagnose() {
    const pdfPath = 'CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf';
    console.log('[DIAGNOSE] Leyendo PDF...');
    
    let existingPdfBytes;
    try {
        existingPdfBytes = fs.readFileSync(pdfPath);
    } catch (e: any) {
        console.error('[DIAGNOSE] Error fatal leyendo archivo:', e.message);
        return;
    }

    const mainPdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
    const totalPages = mainPdfDoc.getPageCount();
    console.log(`[DIAGNOSE] PDF cargado: ${totalPages} páginas.`);

    console.log('[DIAGNOSE] Usando documentos de prueba (Mock) para validación autónoma...');
    let pendingDocs: string[] = ['PL99454', 'XGD348', 'FEI123', 'TEST001'];
    console.log(`[DIAGNOSE] Documentos a buscar: ${pendingDocs.join(', ')}`);

    const prompt = `Actúa como un motor OCR de alta precisión. 
    Analiza esta imagen de una factura/remisión de transporte. 
    Busca y extrae exclusivamente el NÚMERO DE DOCUMENTO (Factura No., Remisión No., Guía No.). 
    Ignora fechas, valores monetarios y NITs. 
    Si encuentras el número, responde SOLO con el número (ej: 123456). 
    Si no hay un número de documento claro, responde "VACIO".`;

    for (let i = 0; i < Math.min(totalPages, 5); i++) { // Probar solo las primeras 5
        console.log(`--- ANALIZANDO PÁGINA ${i + 1}/${totalPages} ---`);
        const subPdf = await PDFDocument.create();
        const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
        subPdf.addPage(copiedPage);
        const base64Page = await subPdf.saveAsBase64();

        try {
            const visionModel = getVisionModel();
            const result = await generateContentWithRetry(visionModel, [
                { text: prompt },
                { inlineData: { data: base64Page, mimeType: "application/pdf" } }
            ]);
            
            const response = await result.response;
            const rawText = response.text().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            console.log(`[Pág ${i+1}] Extraído: [${rawText}]`);

            if (rawText && rawText !== "VACIO") {
                let foundMatch = false;
                for (const docNum of pendingDocs) {
                    const cleanDocNum = docNum.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    if (rawText.includes(cleanDocNum) || cleanDocNum.includes(rawText)) {
                        console.log(`✅ MATCH: ${docNum}`);
                        foundMatch = true;
                    }
                }
                if (!foundMatch) console.log(`❌ No hay match para: ${rawText}`);
            }
        } catch (err: any) {
            console.error(`[Pág ${i+1}] Error:`, err.message);
        }
        await sleep(5000);
    }
    
    await pool.end();
}

runDiagnose().catch(console.error);
