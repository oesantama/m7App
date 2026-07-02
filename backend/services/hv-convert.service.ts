/**
 * hv-convert.service.ts
 * Convierte HEIC / JPG / PNG → PDF usando sharp + pdf-lib (ya instalados).
 * El PDF resultante mantiene la imagen a tamaño de página carta.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// pdf-lib ya está en package.json
import { PDFDocument } from 'pdf-lib';

type ConvertResult = { buffer: Buffer; mimeType: 'application/pdf'; ext: 'pdf' };

function isMimeImage(mime: string): boolean {
    return mime.startsWith('image/') || mime === 'application/octet-stream';
}

/**
 * Si el archivo ya es PDF, lo devuelve tal cual.
 * Si es imagen (HEIC, JPG, PNG, WEBP…), lo convierte a PDF de una sola página.
 */
export async function convertToPdf(
    inputBuffer: Buffer,
    originalName: string,
    mimeType: string
): Promise<ConvertResult> {
    const ext = path.extname(originalName).toLowerCase().replace('.', '');

    // Ya es PDF
    if (mimeType === 'application/pdf' || ext === 'pdf') {
        return { buffer: inputBuffer, mimeType: 'application/pdf', ext: 'pdf' };
    }

    // Imagen → PDF
    if (isMimeImage(mimeType) || ['jpg','jpeg','png','heic','heif','webp','bmp','tiff','gif'].includes(ext)) {
        let imageBuffer = inputBuffer;

        // HEIC/HEIF → JPEG usando sharp (si está disponible)
        if (['heic','heif'].includes(ext) || mimeType.includes('heic') || mimeType.includes('heif')) {
            imageBuffer = await heicToJpeg(inputBuffer);
        }

        // Crear PDF de página carta con la imagen
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // Letter 8.5x11 in points

        let pdfImage;
        const lowerMime = mimeType.toLowerCase();
        try {
            if (lowerMime.includes('png') || ext === 'png') {
                pdfImage = await pdfDoc.embedPng(imageBuffer);
            } else {
                // JPEG por defecto
                pdfImage = await pdfDoc.embedJpg(imageBuffer);
            }
        } catch {
            // Si falla como PNG, probar como JPEG
            try {
                pdfImage = await pdfDoc.embedJpg(imageBuffer);
            } catch {
                pdfImage = await pdfDoc.embedPng(imageBuffer);
            }
        }

        const margin = 20;
        const maxW = page.getWidth() - margin * 2;
        const maxH = page.getHeight() - margin * 2;
        const imgW = pdfImage.width;
        const imgH = pdfImage.height;
        const scale = Math.min(maxW / imgW, maxH / imgH, 1);
        const drawW = imgW * scale;
        const drawH = imgH * scale;

        page.drawImage(pdfImage, {
            x: (page.getWidth() - drawW) / 2,
            y: (page.getHeight() - drawH) / 2,
            width: drawW,
            height: drawH,
        });

        const bytes = await pdfDoc.save();
        return { buffer: Buffer.from(bytes), mimeType: 'application/pdf', ext: 'pdf' };
    }

    // Tipo desconocido → devolver tal cual (el backend aceptará el archivo)
    return { buffer: inputBuffer, mimeType: 'application/pdf', ext: 'pdf' };
}

async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
    try {
        // sharp con soporte HEIC (requiere libheif)
        // @ts-ignore
        const sharp = (await import('sharp')).default;
        return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    } catch {
        // Si sharp no tiene soporte HEIC, devolver el buffer tal cual
        // (pdf-lib intentará embedJpg y fallará graciosamente)
        return buffer;
    }
}

/**
 * Valida un archivo antes de procesar
 */
export function validateUpload(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    maxMb = 15
): { valid: boolean; error?: string } {
    const mb = buffer.length / (1024 * 1024);
    if (mb > maxMb) {
        return { valid: false, error: `El archivo excede el tamaño máximo permitido (${maxMb}MB)` };
    }

    const ext = path.extname(originalName).toLowerCase().replace('.', '');
    const allowed = ['pdf','jpg','jpeg','png','heic','heif','webp','bmp','tiff'];
    if (!allowed.includes(ext)) {
        return { valid: false, error: `Formato no permitido: ${ext}. Use PDF, JPG, PNG o HEIC` };
    }

    return { valid: true };
}
