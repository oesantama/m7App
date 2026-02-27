/**
 * Tests unitarios: Filtro de Facturas APTAS en RoutePlanner
 * Verifica que el status correcto (documents_l.status) sea usado para filtrar
 */
import { describe, it, expect } from 'vitest';

// Replicar la lógica de validInvoices de RoutePlanner para testear en aislamiento
const VALID_STATUSES = ['PENDIENTE', 'AUDITADO', 'INVENTARIADO', 'EN CONTEO', 'PAGADO'];

const isInvoiceEligible = (invoice: any, selectedClient: string, exemptions: string[] = []): boolean => {
  if (exemptions.includes(invoice.id)) return false;

  // FILTRO 1: cliente
  const invClientId = invoice.clientId || invoice.client_id;
  const clientMatch = selectedClient === 'GLOBAL' || invClientId === selectedClient;
  if (!clientMatch) return false;

  // FILTRO 2: status
  const s = String(invoice.status || '').toUpperCase();
  return VALID_STATUSES.includes(s);
};

describe('RoutePlanner: Filtro Facturas APTAS', () => {
  describe('Filtro por status - Debe pasar', () => {
    const testCases = ['Pendiente', 'PENDIENTE', 'Auditado', 'AUDITADO', 'Inventariado', 'INVENTARIADO', 'En Conteo', 'EN CONTEO', 'Pagado', 'PAGADO'];
    testCases.forEach(status => {
      it(`debe aceptar status "${status}"`, () => {
        const inv = { id: '1', clientId: 'CLI-01', status };
        expect(isInvoiceEligible(inv, 'CLI-01')).toBe(true);
      });
    });
  });

  describe('Filtro por status - Debe rechazar', () => {
    it('debe rechazar status "EST-10" (bug original - item_status de BD)', () => {
      const inv = { id: '1', clientId: 'CLI-01', status: 'EST-10' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(false);
    });

    it('debe rechazar status "Finalizado"', () => {
      const inv = { id: '1', clientId: 'CLI-01', status: 'Finalizado' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(false);
    });

    it('debe rechazar status "Entregado"', () => {
      const inv = { id: '1', clientId: 'CLI-01', status: 'Entregado' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(false);
    });

    it('debe rechazar status null o vacío', () => {
      const inv1 = { id: '1', clientId: 'CLI-01', status: null };
      const inv2 = { id: '2', clientId: 'CLI-01', status: '' };
      expect(isInvoiceEligible(inv1, 'CLI-01')).toBe(false);
      expect(isInvoiceEligible(inv2, 'CLI-01')).toBe(false);
    });
  });

  describe('Filtro por cliente', () => {
    it('debe aceptar factura del cliente correcto', () => {
      const inv = { id: '1', clientId: 'CLI-01', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(true);
    });

    it('debe rechazar factura de cliente diferente', () => {
      const inv = { id: '1', clientId: 'CLI-02', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(false);
    });

    it('GLOBAL debe aceptar facturas de cualquier cliente', () => {
      const inv = { id: '1', clientId: 'CLI-99', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'GLOBAL')).toBe(true);
    });

    it('debe leer client_id si clientId no existe (camelCase/snake_case)', () => {
      const inv = { id: '1', client_id: 'CLI-01', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'CLI-01')).toBe(true);
    });
  });

  describe('Exempciones (facturas excluidas manualmente)', () => {
    it('debe excluir factura con ID en exemptions', () => {
      const inv = { id: 'EXCL-01', clientId: 'CLI-01', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'CLI-01', ['EXCL-01'])).toBe(false);
    });

    it('no debe afectar otras facturas', () => {
      const inv = { id: 'OK-01', clientId: 'CLI-01', status: 'Pendiente' };
      expect(isInvoiceEligible(inv, 'CLI-01', ['EXCL-01'])).toBe(true);
    });
  });
});
