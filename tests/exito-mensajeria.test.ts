import { describe, it, expect } from 'vitest';
import {
  detectMimeByMagicBytes,
  sanitizeDriveSegment,
  buildExitoDrivePath,
} from '../backend/services/exito-drive.service';
import {
  maskPIIForLogs,
  getNextRetryDelayMinutes,
  exitoCircuitBreaker,
} from '../backend/services/exito-sync.service';
import { buildExitoOpenApiSpec } from '../backend/services/exito-openapi.service';

describe('Módulo Éxito Mensajería (MOD-11) — Pruebas Unitarias y de Seguridad Go Éxito v2.0', () => {
  describe('1. ExitoDriveService — Validación de Archivos y Estructura en Google Drive', () => {
    it('detecta correctamente magic bytes de PNG, JPEG y PDF y rechaza binarios maliciosos', () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
      const pdfBuf = Buffer.from('%PDF-1.7 contenido de prueba para rotulo');
      const exeBuf = Buffer.from('MZ9000_binary_executable_payload');

      expect(detectMimeByMagicBytes(pngBuf)).toBe('image/png');
      expect(detectMimeByMagicBytes(jpgBuf)).toBe('image/jpeg');
      expect(detectMimeByMagicBytes(pdfBuf)).toBe('application/pdf');
      expect(detectMimeByMagicBytes(exeBuf)).toBeNull();
    });

    it('sanitiza nombres de archivo previniendo Path Traversal e inyección de comandos', () => {
      expect(sanitizeDriveSegment('../../etc/passwd; rm -rf /')).toBe('etc_passwd_rm_-rf');
      expect(sanitizeDriveSegment('M7E-90889079025')).toBe('M7E-90889079025');
    });

    it('construye la jerarquía obligatoria exito_fulfillment/{Same_Day|Next_Day}/{Etapa}/{año}/{mes}/{guia}/', () => {
      const fixedDate = new Date('2026-11-04T14:30:00Z');
      const pathSameDay = buildExitoDrivePath({
        numeroGuia: '90889079025',
        tipoOperacion: 'SAME_DAY',
        etapa: 'Entregas',
        tipoEvidencia: 'foto_entrega',
        extension: 'jpg',
        isSandbox: false,
        date: fixedDate,
      });

      expect(pathSameDay).toContain('exito_fulfillment/Same_Day/Entregas/2026/11/90889079025/');
      expect(pathSameDay.endsWith('_90889079025_foto_entrega.jpg')).toBe(true);

      const pathNextDay = buildExitoDrivePath({
        numeroGuia: '90889079026',
        tipoOperacion: 'NEXT_DAY',
        etapa: 'Recogidas',
        tipoEvidencia: 'remision_recogida',
        extension: 'pdf',
        isSandbox: false,
        date: fixedDate,
      });

      expect(pathNextDay).toContain('exito_fulfillment/Next_Day/Recogidas/2026/11/90889079026/');
      expect(pathNextDay.endsWith('_90889079026_remision_recogida.pdf')).toBe(true);
    });
  });

  describe('2. ExitoSyncService — Enmascaramiento PII, Reintentos 24h y Circuit Breaker', () => {
    it('enmascara datos personales (PII) y secretos según Secciones 4, 12 y 13 de Go Éxito v2.0', () => {
      const rawPayload = {
        'x-api-key': 'secret_prod_key_12345',
        nombre_destinatario: 'Pedro Perez',
        celular_destinatario: '3001234567',
        direccion_destinatario: 'Carrera 43A # 14 - 50',
        correo_destinatario: 'pedro@gmail.com',
        nit_destinatario: '1037654321',
        numero_pedido: '14123456789-03',
      };

      const masked = maskPIIForLogs(rawPayload);
      expect(masked['x-api-key']).toBe('***REDACTED***');
      expect(masked.nombre_destinatario).toBe('P***o P***z');
      expect(masked.celular_destinatario).toBe('******4567');
      expect(masked.direccion_destinatario).toBe('Carre*** # ***');
      expect(masked.correo_destinatario).toBe('p***o@gmail.com');
      expect(masked.nit_destinatario).toBe('******4321');
      expect(masked.numero_pedido).toBe('14123456789-03');
    });

    it('aplica exactamente el calendario de reintentos de la Sección 9.2 (1m, 2m, 5m, 15m, 30m)', () => {
      expect(getNextRetryDelayMinutes(1)).toBe(1);
      expect(getNextRetryDelayMinutes(2)).toBe(2);
      expect(getNextRetryDelayMinutes(3)).toBe(5);
      expect(getNextRetryDelayMinutes(4)).toBe(15);
      expect(getNextRetryDelayMinutes(5)).toBe(30);
      expect(getNextRetryDelayMinutes(12)).toBe(30);
    });

    it('abre el Circuit Breaker tras >= 50% de fallas en >= 20 solicitudes en 30s', () => {
      exitoCircuitBreaker.reset();
      expect(exitoCircuitBreaker.getStatus().state).toBe('CLOSED');

      for (let i = 0; i < 10; i++) exitoCircuitBreaker.recordSuccess();
      for (let i = 0; i < 10; i++) exitoCircuitBreaker.recordFailure();

      expect(exitoCircuitBreaker.getStatus().state).toBe('OPEN');
      expect(exitoCircuitBreaker.canPass()).toBe(false);

      exitoCircuitBreaker.reset();
      expect(exitoCircuitBreaker.getStatus().state).toBe('CLOSED');
    });
  });

  describe('3. ExitoOpenApiService — Contrato Oficial OpenAPI 3.0.3 (Anexo A)', () => {
    it('incluye todos los endpoints oficiales de Go Éxito v2.0', () => {
      const spec = buildExitoOpenApiSpec('https://orbitm7.m7apps.com');
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.paths['/api/v1/guides']).toBeDefined();
      expect(spec.paths['/api/v1/pickups']).toBeDefined();
      expect(spec.paths['/api/v1/guides/{guideNumber}/cancel']).toBeDefined();
      expect(spec.paths['/api/v1/guides/{guideNumber}/label']).toBeDefined();
      expect(spec.paths['/api/v1/guides/{guideNumber}']).toBeDefined();
    });
  });
});

