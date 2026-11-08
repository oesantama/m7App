import { describe, it, expect, vi } from 'vitest';

vi.mock('puppeteer', () => ({ default: {} }));
const { periodosRecientes, periodosDeMeses } = await import('../services/scraper.service.js');

describe('Periodos de consulta Transportando', () => {
  it('de hoy a 7 meses atrás, de lo más reciente a lo más antiguo', () => {
    const p = periodosRecientes(new Date(2026, 10, 5), 7); // 05/11/2026
    expect(p[0]).toEqual({ start: '2026-11-01', end: '2026-11-05' });
    expect(p[1]).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(p[p.length - 1]).toEqual({ start: '2026-04-05', end: '2026-04-30' });
    expect(p).toHaveLength(8);
    const inicios = p.map(x => x.start);
    expect([...inicios].sort().reverse()).toEqual(inicios);
  });

  it('cruza de año sin desfases', () => {
    const p = periodosRecientes(new Date(2027, 0, 31), 7); // 31/01/2027
    expect(p[0]).toEqual({ start: '2027-01-01', end: '2027-01-31' });
    expect(p[1]).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(p[p.length - 1].start).toBe('2026-07-01');
  });

  it('el primer día del mes solo consulta ese día del mes en curso', () => {
    const p = periodosRecientes(new Date(2026, 2, 1), 7);
    expect(p[0]).toEqual({ start: '2026-03-01', end: '2026-03-01' });
    expect(p[1]).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('meses pendientes → periodos únicos, del más reciente al más antiguo, sin pasar de hoy', () => {
    const p = periodosDeMeses(['2026-06', '2026-11', '2026-09', '2026-09', '2026-12'], new Date(2026, 10, 5));
    expect(p).toEqual([
      { start: '2026-11-01', end: '2026-11-05' },
      { start: '2026-09-01', end: '2026-09-30' },
      { start: '2026-06-01', end: '2026-06-30' },
    ]);
  });
});
