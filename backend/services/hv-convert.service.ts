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
        const pkg = 'sharp';
        // @ts-ignore
        const sharp = (await import(/* @vite-ignore */ pkg)).default;
        return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    } catch {
        // Si sharp no tiene soporte HEIC, devolver el buffer tal cual
        return buffer;
    }
}


/**
 * Detecta el tipo real del archivo inspeccionando la firma binaria (Magic Bytes)
 */
function detectMagicBytes(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 4) return null;

    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return 'pdf';
    }

    // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47)
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'png';
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'jpeg';
    }

    // WEBP: RIFF...WEBP
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
    }

    // BMP: BM (0x42 0x4D)
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return 'bmp';
    }

    // TIFF: II* (0x49 0x49 0x2A 0x00) o MM* (0x4D 0x4D 0x00 0x2A)
    if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
        (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)) {
        return 'tiff';
    }

    // HEIC / HEIF: ftypheic, ftypheif, ftypmif1, ftypmsf1 a partir del byte 4
    if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        const brand = buffer.toString('ascii', 8, 12);
        if (['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'].includes(brand)) {
            return 'heic';
        }
    }

    return null;
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
        return { valid: false, error: `Formato no permitido: .${ext}. Use PDF, JPG, PNG o HEIC` };
    }

    // Validar cabecera real de bytes (Magic Bytes)
    const detectedType = detectMagicBytes(buffer);
    if (!detectedType) {
        return { valid: false, error: `El contenido del archivo no coincide con una firma válida de documento o imagen (.${ext})` };
    }

    // Mapeo de compatibilidad entre extensión y tipo binario detectado
    const extMap: Record<string, string[]> = {
        pdf: ['pdf'],
        jpg: ['jpeg'],
        jpeg: ['jpeg'],
        png: ['png'],
        webp: ['webp'],
        bmp: ['bmp'],
        tiff: ['tiff'],
        heic: ['heic', 'jpeg'],
        heif: ['heic', 'jpeg'],
    };

    const validTypes = extMap[ext] || [];
    if (validTypes.length > 0 && !validTypes.includes(detectedType)) {
        return { valid: false, error: `El archivo tiene extensión .${ext} pero su contenido binario real es de tipo '${detectedType}'` };
    }

    return { valid: true };
}

