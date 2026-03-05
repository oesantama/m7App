
import { PDFDocument } from 'pdf-lib';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const filePath = "C:\\Users\\Admin\\Documents\\oscar\\m7App\\CUMPLIDOS FEBRERO 10  2026 PL99454 XGD348.pdf";

async function testOCR() {
    console.log("--- TEST OCR M7 CORE ---");
    if (!fs.existsSync(filePath)) {
        console.error("Archivo no encontrado:", filePath);
        return;
    }

    try {
        const data = fs.readFileSync(filePath);
        const mainPdfDoc = await PDFDocument.load(data);
        const totalPages = mainPdfDoc.getPageCount();
        console.log(`Páginas totales: ${totalPages}`);

        // Probar solo las primeras 3 páginas para diagnóstico rápido
        for (let i = 0; i < Math.min(totalPages, 3); i++) {
            console.log(`\n--- Analizando Pág ${i+1} ---`);
            const subPdf = await PDFDocument.create();
            const [copiedPage] = await subPdf.copyPages(mainPdfDoc, [i]);
            subPdf.addPage(copiedPage);
            const base64Page = await subPdf.saveAsBase64();

            const prompt = `Analiza detalladamente esta página de un documento logístico.
            OBJETIVO: Extraer el Número de Documento, Factura o Comprobante.
            Responde con los números encontrados o "VACIO".`;

            const result = await visionModel.generateContent([
                { text: prompt },
                { inlineData: { data: base64Page, mimeType: "application/pdf" } }
            ]);
            const response = await result.response;
            console.log(`Pág ${i+1} RAW: "${response.text().trim()}"`);
        }
    } catch (err) {
        console.error("Error crítico en el test:", err.message);
    }
}

testOCR();
