import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Tesseract from 'tesseract.js';

const execAsync = util.promisify(exec);

export const performLocalOCR = async (pdfBuffer: Buffer): Promise<string> => {
    const tmpId = crypto.randomBytes(8).toString('hex');
    const pdfPath = path.join('/tmp', `m7-ocr-${tmpId}.pdf`);
    const outPrefix = path.join('/tmp', `m7-ocr-${tmpId}`);
    
    try {
        fs.writeFileSync(pdfPath, pdfBuffer);
        
        // pdftoppm -png /tmp/m7-ocr-xyz.pdf /tmp/m7-ocr-xyz
        // Esto generará archivos como /tmp/m7-ocr-xyz-1.png, /tmp/m7-ocr-xyz-2.png
        await execAsync(`pdftoppm -png "${pdfPath}" "${outPrefix}"`);
        
        // Buscar las imagenes generadas
        const files = fs.readdirSync('/tmp').filter(f => f.startsWith(`m7-ocr-${tmpId}-`) && f.endsWith('.png'));
        
        let fullText = '';
        const worker = await Tesseract.createWorker('spa'); // Usar español
        
        for (const file of files.sort()) {
            const imgPath = path.join('/tmp', file);
            const { data: { text } } = await worker.recognize(imgPath);
            fullText += text + '\n\n';
            fs.unlinkSync(imgPath); // Limpiar
        }
        
        await worker.terminate();
        return fullText.trim();
    } catch (e) {
        console.error('[OCR Local] Error:', e);
        return '';
    } finally {
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }
    }
};
