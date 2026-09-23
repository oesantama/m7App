import { describe, it, expect } from 'vitest';
import { validateUpload } from '../services/hv-convert.service.js';
import { sanitizeFolderName, buildDrivePath } from '../services/hv-drive.service.js';

describe('Pruebas Unitarias del Módulo de Hojas de Vida (Seguridad y Servicios)', () => {

    describe('1. Validación de Archivos y Magic Bytes (validateUpload)', () => {
        it('debe aceptar un archivo PDF legítimo', () => {
            const pdfBuffer = Buffer.from('%PDF-1.4 contenido de prueba legitimo en formato PDF');
            const result = validateUpload(pdfBuffer, 'application/pdf', 'cedula.pdf');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('debe aceptar una imagen PNG legítima', () => {
            const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
            const result = validateUpload(pngBuffer, 'image/png', 'foto.png');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('debe aceptar una imagen JPEG legítima', () => {
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
            const result = validateUpload(jpegBuffer, 'image/jpeg', 'licencia.jpg');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('debe rechazar un ejecutable o script malicioso renombrado a .pdf (Disguised File)', () => {
            const scriptBuffer = Buffer.from('#!/bin/bash\necho "Script de prueba malicioso"');
            const result = validateUpload(scriptBuffer, 'application/pdf', 'documento_renombrado.pdf');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('no coincide con una firma válida');
        });

        it('debe rechazar un archivo con extensión no coincidente (Buffer PNG renombrado a .pdf)', () => {
            const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            const result = validateUpload(pngBuffer, 'application/pdf', 'archivo_falso.pdf');
            expect(result.valid).toBe(false);
            expect(result.error).toContain("extensión .pdf pero su contenido binario real es de tipo 'png'");
        });

        it('debe rechazar extensiones prohibidas (ej. .exe, .sh, .php)', () => {
            const pdfBuffer = Buffer.from('%PDF-1.4 test');
            const resultExe = validateUpload(pdfBuffer, 'application/octet-stream', 'programa.exe');
            expect(resultExe.valid).toBe(false);
            expect(resultExe.error).toContain('Formato no permitido: .exe');

            const resultSh = validateUpload(pdfBuffer, 'text/plain', 'script.sh');
            expect(resultSh.valid).toBe(false);
            expect(resultSh.error).toContain('Formato no permitido: .sh');
        });

        it('debe rechazar archivos que excedan el límite máximo de tamaño (15MB)', () => {
            const hugeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16 MB
            hugeBuffer.write('%PDF-1.4');
            const result = validateUpload(hugeBuffer, 'application/pdf', 'gran_documento.pdf');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('excede el tamaño máximo permitido');
        });
    });

    describe('2. Sanitización de Nombres de Carpeta (sanitizeFolderName)', () => {
        it('debe limpiar caracteres especiales y path traversal de nombres de carpeta', () => {
            const unsafeName = '../../etc/passwd <script>alert(1)</script>  Juan  Pérez!! ';
            const sanitized = sanitizeFolderName(unsafeName);
            expect(sanitized).not.toContain('..');
            expect(sanitized).not.toContain('<');
            expect(sanitized).not.toContain('>');
            expect(sanitized).toBe('etcpasswd scriptalert1script Juan Perez');
        });

        it('debe normalizar tildes y caracteres acentuados', () => {
            const input = 'Álvaro José Gómez Córdova';
            const sanitized = sanitizeFolderName(input);
            expect(sanitized).toBe('Alvaro Jose Gomez Cordova');
        });
    });

    describe('3. Construcción de Rutas de Almacenamiento (buildDrivePath)', () => {
        it('debe generar la ruta correcta para vehículos por placa', () => {
            const pathResult = buildDrivePath('vehiculo', null, 'ABC-123', 'tarjeta_propiedad.pdf');
            expect(pathResult).toBe('Placas/ABC-123/tarjeta_propiedad.pdf');
        });

        it('debe generar la ruta correcta para conductores', () => {
            const pathResult = buildDrivePath('tercero', 'conductor', '1012345678 Carlos Ruiz', 'cedula.pdf');
            expect(pathResult).toBe('Terceros/Conductores/1012345678 Carlos Ruiz/cedula.pdf');
        });

        it('debe generar la ruta correcta para perfiles de cargo', () => {
            const pathResult = buildDrivePath('tercero', 'PerfilesCargo', 'Milla7', 'Perfil_Conductor.pdf');
            expect(pathResult).toBe('PERFILES DE CARGO MILLA 7/Perfil_Conductor.pdf');
        });
    });
});
