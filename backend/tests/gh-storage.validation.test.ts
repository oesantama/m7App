// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// El servicio importa el pool de PostgreSQL; para validar archivos no se necesita BD
vi.mock('../config/database.js', () => ({ default: { query: vi.fn() } }));

const { detectMime, validateUpload, safeSegment, sha256, rutaArchivoActivo, rutaArchivoEnvio, GH_DRIVE_BASE } =
    await import('../services/gh-storage.service.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32)]);

describe('Evidencias — detección de tipo real', () => {
    it('reconoce PNG, JPEG, WEBP y PDF por sus bytes iniciales', () => {
        expect(detectMime(PNG)).toBe('image/png');
        expect(detectMime(JPEG)).toBe('image/jpeg');
        expect(detectMime(WEBP)).toBe('image/webp');
        expect(detectMime(PDF)).toBe('application/pdf');
    });

    it('rechaza archivos disfrazados (HTML/script con extensión de imagen)', () => {
        expect(detectMime(Buffer.from('<script>alert(1)</script>.....'))).toBeNull();
        expect(detectMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
        expect(() => validateUpload(Buffer.from('<html><body>x</body></html>'), ['image'])).toThrow('Tipo de archivo no permitido');
    });
});

describe('Evidencias — reglas de validación', () => {
    it('la firma solo acepta PNG', () => {
        expect(validateUpload(PNG, ['png']).mime).toBe('image/png');
        expect(() => validateUpload(JPEG, ['png'])).toThrow();
    });

    it('las fotos no aceptan PDF y los soportes de activos sí', () => {
        expect(() => validateUpload(PDF, ['image'])).toThrow();
        expect(validateUpload(PDF, ['image', 'pdf']).ext).toBe('pdf');
    });

    it('rechaza archivos vacíos y fotos de más de 5 MB', () => {
        expect(() => validateUpload(Buffer.alloc(0), ['image'])).toThrow('vacío');
        const grande = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
        expect(() => validateUpload(grande, ['image'])).toThrow('5 MB');
    });

    it('calcula el SHA-256 que queda como huella de la evidencia', () => {
        const info = validateUpload(PNG, ['png']);
        expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(info.sha256).toBe(sha256(PNG));
        expect(info.size).toBe(PNG.length);
    });
});

describe('Evidencias — rutas en Drive', () => {
    it('neutraliza intentos de salir de la carpeta o inyectar comandos', () => {
        expect(safeSegment('../../etc/passwd')).not.toContain('..');
        expect(safeSegment('../../etc/passwd')).not.toContain('/');
        expect(safeSegment('x"; rm -rf / #')).not.toMatch(/["';#/\\]/);
        expect(safeSegment('$(whoami)')).not.toContain('$');
    });

    it('conserva nombres legibles sin tildes', () => {
        expect(safeSegment('CÁMARA DE SEGURIDAD')).toBe('CAMARA DE SEGURIDAD');
        expect(safeSegment('')).toBe('SIN_NOMBRE');
    });
});

describe('Evidencias — organización de carpetas en Drive', () => {
    it('activos: raíz / HOJA DE VIDA ACTIVOS / tipo / código - nombre / año', () => {
        const r = rutaArchivoActivo({ tipo: 'CÁMARA DE SEGURIDAD', codigo: 'ACT-00007', nombre: 'Cámara portería',
            fecha: '2026-10-21', evento: 'MANTENIMIENTO_PREVENTIVO', eventoId: 40, n: 2, ext: 'jpg' });
        expect(r).toBe(`${GH_DRIVE_BASE}/HOJA DE VIDA ACTIVOS/CAMARA DE SEGURIDAD/ACT-00007 - Camara porteria/2026/2026-10-21 MANTENIMIENTO PREVENTIVO #40-2.jpg`);
    });

    it('mensajería: raíz / MENSAJERIA / año / mes / tracking - destinatario / FIRMAS|EVIDENCIAS', () => {
        const base = { creado: new Date('2026-10-21T15:00:00Z'), tracking: 'ENV-261021-0005', destinatario: 'Éxito Laureles', eventoId: 12 };
        expect(rutaArchivoEnvio({ ...base, tipo: 'FIRMA_MENSAJERO', ext: 'png' }))
            .toBe(`${GH_DRIVE_BASE}/MENSAJERIA/2026/10 - OCTUBRE/ENV-261021-0005 - Exito Laureles/FIRMAS/FIRMA MENSAJERO #12.png`);
        expect(rutaArchivoEnvio({ ...base, tipo: 'FOTO_ENTREGA', ext: 'jpg' }))
            .toContain('/EVIDENCIAS/FOTO ENTREGA #12.jpg');
    });

    it('usa el mes de Colombia aunque el servidor esté en UTC', () => {
        // 1 de noviembre 02:00 UTC = 31 de octubre 21:00 en Bogotá
        const r = rutaArchivoEnvio({ creado: new Date('2026-11-01T02:00:00Z'), tracking: 'ENV-261031-0001',
            destinatario: 'X', tipo: 'FOTO_PAQUETE', eventoId: 1, ext: 'jpg' });
        expect(r).toContain('/MENSAJERIA/2026/10 - OCTUBRE/');
    });

    it('dos recogidas del mismo envío no se sobrescriben', () => {
        const base = { creado: new Date(), tracking: 'ENV-1', destinatario: 'X', tipo: 'FIRMA_MENSAJERO', ext: 'png' };
        expect(rutaArchivoEnvio({ ...base, eventoId: 1 })).not.toBe(rutaArchivoEnvio({ ...base, eventoId: 2 }));
    });
});
