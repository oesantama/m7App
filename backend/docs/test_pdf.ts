import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { performLocalPageOCR } from '../utils/ocr.js';
import Tesseract from 'tesseract.js';

async function main() {
    const pdfPath = '/app/backend/docs/test_sample.pdf';
    console.log('Testing Tesseract local OCR with pdftoppm...');
    const worker = await Tesseract.createWorker(['eng', 'spa']);

    for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
        try {
            const tessText = await performLocalPageOCR(pdfPath, pageIndex, worker);
            console.log(`\n=== PAGE ${pageIndex + 1} TESSERACT OCR (${tessText.length} chars) ===`);
            console.log(tessText.substring(0, 300));
            const matches = tessText.match(/\d{4,12}/g) || [];
            console.log(`Extracted numbers on Page ${pageIndex + 1}:`, matches);
        } catch (e: any) {
            console.error(`Page ${pageIndex + 1} Error:`, e.message);
        }
    }
    await worker.terminate();
}

main().catch(console.error);
