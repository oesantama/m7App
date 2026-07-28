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

export const performLocalPageOCR = async (pdfFilePath: string, pageIndex: number, worker?: any): Promise<string> => {
    const tmpId = crypto.randomBytes(6).toString('hex');
    const pageNum = pageIndex + 1;
    const outPrefix = path.join('/tmp', `m7-p${pageNum}-${tmpId}`);
    
    try {
        // Renderizado a 200 DPI para ultra-precisión en dígitos de facturas y actas escaneadas
        await execAsync(`pdftoppm -png -r 200 -f ${pageNum} -l ${pageNum} "${pdfFilePath}" "${outPrefix}"`);
        
        const files = fs.readdirSync('/tmp').filter(f => f.startsWith(`m7-p${pageNum}-${tmpId}`) && f.endsWith('.png'));
        if (files.length === 0) return '';
        
        const imgPath = path.join('/tmp', files[0]);
        
        let localWorker = worker;
        let createdWorker = false;
        if (!localWorker) {
            localWorker = await Tesseract.createWorker(['eng', 'spa']);
            createdWorker = true;
        }
        
        let { data: { text } } = await localWorker.recognize(imgPath);
        if (fs.existsSync(imgPath)) { try { fs.unlinkSync(imgPath); } catch (_) {} }

        // Si el escaneo a 0° no detectó secuencias numéricas de facturas (posible acta rotada 90° de lado)
        const hasDigits = /\d{4,10}/.test(text || '');
        if (!hasDigits) {
            const rotPrefix = path.join('/tmp', `m7-p${pageNum}-${tmpId}-r90`);
            try {
                await execAsync(`pdftoppm -png -r 200 -rot 90 -f ${pageNum} -l ${pageNum} "${pdfFilePath}" "${rotPrefix}"`);
                const rotFiles = fs.readdirSync('/tmp').filter(f => f.startsWith(`m7-p${pageNum}-${tmpId}-r90`) && f.endsWith('.png'));
                if (rotFiles.length > 0) {
                    const rotImgPath = path.join('/tmp', rotFiles[0]);
                    const rotRes = await localWorker.recognize(rotImgPath);
                    if (rotRes.data?.text) {
                        text = (text || '') + '\n' + rotRes.data.text;
                    }
                    if (fs.existsSync(rotImgPath)) { try { fs.unlinkSync(rotImgPath); } catch (_) {} }
                }
            } catch (_) {}
        }
        
        if (createdWorker && localWorker) {
            await localWorker.terminate();
        }
        
        return text || '';
    } catch (e: any) {
        console.error(`[OCR Local Pág ${pageIndex + 1}] Error:`, e?.message || e);
        return '';
    }
};

