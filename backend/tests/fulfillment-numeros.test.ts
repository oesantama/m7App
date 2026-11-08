import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/database.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../utils/pdfParser.js', () => ({ pdfParse: vi.fn() }));
const { parseNumeroLimpio } = await import('../controllers/fulfillment.controller.js');

describe('parseNumeroLimpio (importación Fulfillment)', () => {
  it.each([
    ['$ 1.234.567', 1234567],
    ['$1.234.567,89', 1234567.89],
    ['US$ 1,234.56', 1234.56],
    ['USD 45.00', 45],
    ['1.234,50 COP', 1234.5],
    ['25,000', 25000],
    ['$ 35.000', 35000],
    ['12,5', 12.5],
    ['3.75', 3.75],
    ['0.125', 0.125],
    ['(1.500)', -1500],
    ['-$ 2.000,25', -2000.25],
    ['  $ 8 000 ', 8000],
    ['€99', 99],
  ])('"%s" → %s', (txt, esperado) => {
    expect(parseNumeroLimpio(txt)).toBeCloseTo(esperado as number, 6);
  });

  it('respeta los números que ya vienen como número', () => {
    expect(parseNumeroLimpio(473.81)).toBe(473.81);
  });

  it('texto sin número → null', () => {
    expect(parseNumeroLimpio('N/A')).toBeNull();
    expect(parseNumeroLimpio('$')).toBeNull();
    expect(parseNumeroLimpio('')).toBeNull();
  });
});
