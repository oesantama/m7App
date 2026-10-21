// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    puedeTransicionar, validarTransicion, generarTracking, enmascararDocumento, estaAtrasado,
    horasAbierto, esEstadoValido, ESTADOS_ENVIO, EstadoEnvio, ESTADO_ID, estadoDesdeId, idsSql,
} from '../services/gh-mensajeria.logic.js';

describe('Mensajería — flujo de estados', () => {
    it('permite el camino feliz PENDIENTE → ASIGNADO → EN_CAMINO → ENTREGADO', () => {
        expect(puedeTransicionar('PENDIENTE', 'ASIGNADO')).toBe(true);
        expect(puedeTransicionar('ASIGNADO', 'EN_CAMINO')).toBe(true);
        expect(puedeTransicionar('EN_CAMINO', 'ENTREGADO')).toBe(true);
    });

    it('no permite saltarse la recogida ni entregar sin estar en camino', () => {
        expect(puedeTransicionar('PENDIENTE', 'ENTREGADO')).toBe(false);
        expect(puedeTransicionar('ASIGNADO', 'ENTREGADO')).toBe(false);
        expect(puedeTransicionar('PENDIENTE', 'EN_CAMINO')).toBe(false);
    });

    it('los estados finales no tienen salida', () => {
        for (const final of ['ENTREGADO', 'DEVUELTO', 'CANCELADO'] as EstadoEnvio[]) {
            for (const hacia of ESTADOS_ENVIO) expect(puedeTransicionar(final, hacia)).toBe(false);
        }
    });

    it('un FALLIDO se puede reintentar (ASIGNADO) o devolver', () => {
        expect(puedeTransicionar('FALLIDO', 'ASIGNADO')).toBe(true);
        expect(puedeTransicionar('FALLIDO', 'DEVUELTO')).toBe(true);
        expect(puedeTransicionar('FALLIDO', 'ENTREGADO')).toBe(false);
    });

    it('no se puede cancelar un envío que ya va en camino', () => {
        expect(puedeTransicionar('EN_CAMINO', 'CANCELADO')).toBe(false);
    });

    it('valida estados desconocidos', () => {
        expect(esEstadoValido('ENTREGADO')).toBe(true);
        expect(esEstadoValido('PERDIDO')).toBe(false);
        expect(esEstadoValido("ENTREGADO'; DROP TABLE x;--")).toBe(false);
    });
});

describe('Mensajería — evidencias obligatorias', () => {
    it('recoger exige firma del mensajero y foto del paquete', () => {
        expect(validarTransicion({ desde: 'ASIGNADO', hacia: 'EN_CAMINO', mensajeroId: 1, evidencias: ['FIRMA_MENSAJERO'] }))
            .toEqual({ ok: false, error: expect.stringContaining('foto del paquete') });
        expect(validarTransicion({ desde: 'ASIGNADO', hacia: 'EN_CAMINO', mensajeroId: 1, evidencias: ['FIRMA_MENSAJERO', 'FOTO_PAQUETE'] }).ok).toBe(true);
    });

    it('entregar exige firma del destinatario, foto y nombre de quien recibe', () => {
        const base = { desde: 'EN_CAMINO' as const, hacia: 'ENTREGADO' as const, mensajeroId: 1 };
        expect(validarTransicion({ ...base, evidencias: ['FOTO_ENTREGA'], receptorNombre: 'Ana' }))
            .toEqual({ ok: false, error: expect.stringContaining('firma del destinatario') });
        expect(validarTransicion({ ...base, evidencias: ['FIRMA_DESTINATARIO', 'FOTO_ENTREGA'], receptorNombre: '  ' }))
            .toEqual({ ok: false, error: expect.stringContaining('quien recibe') });
        // La firma del mensajero NO sirve como firma del destinatario
        expect(validarTransicion({ ...base, evidencias: ['FIRMA_MENSAJERO', 'FOTO_ENTREGA'], receptorNombre: 'Ana' }).ok).toBe(false);
        expect(validarTransicion({ ...base, evidencias: ['FIRMA_DESTINATARIO', 'FOTO_ENTREGA'], receptorNombre: 'Ana' }).ok).toBe(true);
    });

    it('una incidencia exige foto y motivo', () => {
        const base = { desde: 'EN_CAMINO' as const, hacia: 'FALLIDO' as const, mensajeroId: 1 };
        expect(validarTransicion({ ...base, evidencias: ['FOTO_INCIDENCIA'] }).ok).toBe(false);
        expect(validarTransicion({ ...base, evidencias: [], motivo: 'Ausente' }).ok).toBe(false);
        expect(validarTransicion({ ...base, evidencias: ['FOTO_INCIDENCIA'], motivo: 'Ausente' }).ok).toBe(true);
    });

    it('cancelar y devolver exigen motivo; asignar exige mensajero', () => {
        expect(validarTransicion({ desde: 'PENDIENTE', hacia: 'CANCELADO', evidencias: [] }).ok).toBe(false);
        expect(validarTransicion({ desde: 'PENDIENTE', hacia: 'CANCELADO', evidencias: [], motivo: 'Ya no se requiere' }).ok).toBe(true);
        expect(validarTransicion({ desde: 'PENDIENTE', hacia: 'ASIGNADO', evidencias: [] }).ok).toBe(false);
        expect(validarTransicion({ desde: 'PENDIENTE', hacia: 'ASIGNADO', evidencias: [], mensajeroId: 7 }).ok).toBe(true);
    });
});

describe('Mensajería — tracking, privacidad y alertas', () => {
    it('genera tracking legible con consecutivo diario', () => {
        expect(generarTracking(new Date(2026, 9, 21), 1)).toBe('ENV-261021-0001');
        expect(generarTracking(new Date(2026, 0, 5), 123)).toBe('ENV-260105-0123');
    });

    it('enmascara documentos en listados', () => {
        expect(enmascararDocumento('1023456789')).toBe('******6789');
        expect(enmascararDocumento('123')).toBe('****');
        expect(enmascararDocumento(null)).toBeNull();
    });

    it('marca como atrasado a partir de 24 h y nunca un envío cerrado', () => {
        const ahora = new Date('2026-10-21T12:00:00Z');
        expect(estaAtrasado('EN_CAMINO', new Date('2026-10-20T13:00:00Z'), ahora, 24)).toBe(false);
        expect(estaAtrasado('EN_CAMINO', new Date('2026-10-20T12:00:00Z'), ahora, 24)).toBe(true);
        expect(estaAtrasado('PENDIENTE', new Date('2026-10-19T12:00:00Z'), ahora, 24)).toBe(true);
        expect(estaAtrasado('ENTREGADO', new Date('2026-10-01T12:00:00Z'), ahora, 24)).toBe(false);
        expect(horasAbierto('CANCELADO', new Date('2026-10-01T12:00:00Z'), ahora)).toBeNull();
    });
});

describe('Mensajería — estados de la maestra global', () => {
    it('cada estado tiene un ID EST-xx único y se puede volver al código', () => {
        const ids = ESTADOS_ENVIO.map(e => ESTADO_ID[e]);
        expect(new Set(ids).size).toBe(ESTADOS_ENVIO.length);
        for (const e of ESTADOS_ENVIO) {
            expect(ESTADO_ID[e]).toMatch(/^EST-\d{2}$/);
            expect(estadoDesdeId(ESTADO_ID[e])).toBe(e);
        }
        expect(estadoDesdeId('EST-99')).toBeNull();
    });

    it('reutiliza los estados existentes de la maestra', () => {
        expect(ESTADO_ID.PENDIENTE).toBe('EST-03');
        expect(ESTADO_ID.ENTREGADO).toBe('EST-12');
        expect(idsSql(['PENDIENTE', 'FALLIDO'])).toBe("'EST-03','EST-28'");
    });
});
