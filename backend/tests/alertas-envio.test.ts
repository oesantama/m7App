// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Simulaciones: BD, WhatsApp, correo e informes (no se envía nada real) ──
const destinatarios: any[] = [];
vi.mock('../config/database.js', () => ({
    default: { query: vi.fn(async (sql: string) => (sql.includes('FROM alertas_whatsapp_destinatarios') ? { rows: destinatarios } : { rows: [], rowCount: 0 })) },
}));
const wa = { text: [] as string[], media: [] as { to: string; file: string }[], conectado: true };
vi.mock('../services/evolution.service.js', () => ({
    evolutionService: {
        findFirstConnectedInstance: vi.fn(async () => (wa.conectado ? 'user_test' : null)),
        ensureInstance: vi.fn(async () => {}),
        isInstanceOpen: vi.fn(async () => true),
        sendMessageDirect: vi.fn(async (_i: string, to: string) => { wa.text.push(to); }),
        sendMediaDirect: vi.fn(async (_i: string, to: string, _b: string, file: string) => { wa.media.push({ to, file }); }),
    },
}));
const correos: { to: string; adjuntos: string[] }[] = [];
vi.mock('../services/notification.service.js', () => ({
    sendEmail: vi.fn(async (to: string, _s: string, _h: string, adj?: any[]) => { correos.push({ to, adjuntos: (adj || []).map(a => a.filename) }); }),
}));
vi.mock('../services/client-scope.service.js', () => ({
    resolverAlcanceClientes: vi.fn(async (ids: string[]) => ({ clientIds: ids, nombres: [], documentos: [], nombresConocidos: [], etiqueta: ids.join(', ') })),
}));
const generadas: string[] = [];
vi.mock('../services/facturacion-pendiente-report.service.js', () => ({
    generateFacturacionPendienteReport: vi.fn(async (alcance?: any) => {
        const key = alcance ? alcance.clientIds.join('+') : 'GENERAL';
        generadas.push(key);
        if (key === 'CLI-01') return null; // cliente sin pendientes
        return { total: 1, valor: 1, etiqueta: key, waMessage: `fact ${key}`, emailHtml: `<p>${key}</p>`,
                 excelBuffer: Buffer.from('x'), fileName: `fact_${key}.xlsx` };
    }),
}));
vi.mock('../services/preoperacional-report.service.js', () => ({
    generatePreoperacionalReport: vi.fn(async () => ({
        totalOrders: 3, totalRealizados: 2, totalAptos: 2, totalPendientes: 1, efectividadGlobal: 67, fechaFormateada: '20/10/2026',
        message: 'preop', pdfBase64: 'data:application/pdf;base64,eA==', pdfFileName: 'preop.pdf',
        excelBuffer: Buffer.from('x'), excelFileName: 'preop.xlsx',
    })),
}));
vi.mock('../services/flota-wa-report.service.js', () => ({ generateFlotaReportPdf: vi.fn() }));
vi.mock('../services/cierre-fact-report.service.js', () => ({ generateCierreFactReport: vi.fn() }));
vi.mock('../services/sobrecosto-report.service.js', () => ({ generateSobrecostoReport: vi.fn() }));
vi.mock('../services/sin-operacion-report.service.js', () => ({ generateSinOperacionDiariaReport: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn(), validate: vi.fn(() => true) } }));

const { whatsappCronRunner } = await import('../services/whatsapp-cron.service.js');
// sleep(5000) entre WhatsApp: se acelera para el test
vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);

const alerta = { id: 'A', name: 'Facturación', message_template: '', cron_expression: '0 9 * * 1-6',
                 tipo_evento: 'FACTURACION_PENDIENTE', adjunto_tipo: 'ninguno', status_id: 'EST-01' };
const D = (o: any) => ({ id: Math.random(), nombre: null, phone_number: null, email: null, alcance: 'GENERAL', client_ids: [], ...o });

beforeEach(() => {
    destinatarios.length = 0; wa.text.length = 0; wa.media.length = 0; correos.length = 0; generadas.length = 0; wa.conectado = true;
});

describe('Alertas — envío por canal y alcance', () => {
    it('cada destinatario recibe su alcance por su canal', async () => {
        destinatarios.push(
            D({ email: 'general@x.co', canal: 'EMAIL' }),
            D({ phone_number: '3001112233', canal: 'WHATSAPP', alcance: 'CLIENTE', client_ids: ['CLI-14'] }),
            D({ phone_number: '3004445566', email: 'exito@x.co', canal: 'AMBOS', alcance: 'CLIENTE', client_ids: ['CLI-05', 'CLI-02'] }),
        );
        const r = await whatsappCronRunner.sendAlerta(alerta as any, true);
        expect(r).toMatchObject({ whatsapp: 2, email: 2, omitidos: 0, errores: [] });
        expect(correos).toEqual([
            { to: 'general@x.co', adjuntos: ['fact_GENERAL.xlsx'] },
            { to: 'exito@x.co', adjuntos: ['fact_CLI-02+CLI-05.xlsx'] },
        ]);
        expect(wa.media).toEqual([
            { to: '3001112233', file: 'fact_CLI-14.xlsx' },
            { to: '3004445566', file: 'fact_CLI-02+CLI-05.xlsx' },
        ]);
    });

    it('genera el informe una sola vez por alcance', async () => {
        destinatarios.push(
            D({ email: 'a@x.co', canal: 'EMAIL' }), D({ email: 'b@x.co', canal: 'EMAIL' }),
            D({ email: 'c@x.co', canal: 'EMAIL', alcance: 'CLIENTE', client_ids: ['CLI-14'] }),
            D({ email: 'd@x.co', canal: 'EMAIL', alcance: 'CLIENTE', client_ids: ['CLI-14'] }),
        );
        await whatsappCronRunner.sendAlerta(alerta as any, true);
        expect(generadas.sort()).toEqual(['CLI-14', 'GENERAL']);
        expect(correos).toHaveLength(4);
    });

    it('no envía nada a quien tiene un cliente sin datos', async () => {
        destinatarios.push(D({ phone_number: '3001112233', email: 'm7@x.co', canal: 'AMBOS', alcance: 'CLIENTE', client_ids: ['CLI-01'] }));
        const r = await whatsappCronRunner.sendAlerta(alerta as any, true);
        expect(r).toMatchObject({ whatsapp: 0, email: 0, omitidos: 1 });
        expect(wa.media).toHaveLength(0);
        expect(correos).toHaveLength(0);
    });

    it('sin WhatsApp conectado igual salen los correos', async () => {
        wa.conectado = false;
        destinatarios.push(
            D({ phone_number: '3001112233', email: 'a@x.co', canal: 'AMBOS' }),
            D({ phone_number: '3004445566', canal: 'WHATSAPP' }),
        );
        const r = await whatsappCronRunner.sendAlerta(alerta as any, true);
        expect(r.whatsapp).toBe(0);
        expect(r.email).toBe(1);
        expect(r.errores[0]).toMatch(/instancia de WhatsApp/);
    });

    it('un tipo sin alcance ignora el cliente del destinatario', async () => {
        destinatarios.push(D({ email: 'a@x.co', canal: 'EMAIL', alcance: 'CLIENTE', client_ids: ['CLI-14'] }));
        const r = await whatsappCronRunner.sendAlerta({ ...alerta, tipo_evento: 'MANUAL', message_template: 'Hola {{alerta}}' } as any, true);
        expect(r.email).toBe(1);
        expect(generadas).toHaveLength(0);
    });

    it('preoperacional: envía PDF y Excel por WhatsApp y por correo', async () => {
        destinatarios.push(D({ phone_number: '3001112233', email: 'p@x.co', canal: 'AMBOS' }));
        const r = await whatsappCronRunner.sendAlerta({ ...alerta, tipo_evento: 'PREOPERACIONAL' } as any, true);
        expect(r).toMatchObject({ whatsapp: 1, email: 1 });
        expect(wa.media.map(m => m.file)).toEqual(['preop.pdf', 'preop.xlsx']);
        expect(correos[0].adjuntos).toEqual(['preop.pdf', 'preop.xlsx']);
    });
});
