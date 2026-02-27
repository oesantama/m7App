/**
 * Tests unitarios: Lógica de navegación (sanitización de rutas)
 * Verifica que las rutas de la BD no causen navegación real del browser
 */
import { describe, it, expect } from 'vitest';

// Replicar la función sanitizeRoute de Layout.tsx para testear en aislamiento
const sanitizeRoute = (route: string, isMasterPage: boolean): string => {
  if (!route) return '';
  if (isMasterPage) return 'master';
  const clean = route.replace(/^\/+/, '').split('/')[0];
  return clean;
};

describe('Navigation: sanitizeRoute', () => {
  describe('Rutas maestros', () => {
    it('debe retornar "master" para cualquier ruta de página maestra', () => {
      expect(sanitizeRoute('masterTipoNotificacion', true)).toBe('master');
      expect(sanitizeRoute('masterVehiculos', true)).toBe('master');
      expect(sanitizeRoute('masterEstados', true)).toBe('master');
    });
  });

  describe('Rutas operativas simples (deben pasar igual)', () => {
    it('debe retornar "despacho" sin cambios', () => {
      expect(sanitizeRoute('despacho', false)).toBe('despacho');
    });

    it('debe retornar "rutas" sin cambios', () => {
      expect(sanitizeRoute('rutas', false)).toBe('rutas');
    });

    it('debe retornar "documentos" sin cambios', () => {
      expect(sanitizeRoute('documentos', false)).toBe('documentos');
    });

    it('debe retornar "firmas" sin cambios', () => {
      expect(sanitizeRoute('firmas', false)).toBe('firmas');
    });

    it('debe retornar "gamification" sin cambios', () => {
      expect(sanitizeRoute('gamification', false)).toBe('gamification');
    });

    it('debe retornar "admin-db" sin cambios', () => {
      expect(sanitizeRoute('admin-db', false)).toBe('admin-db');
    });
  });

  describe('Rutas con slash (BUG FIX: no deben causar navegación del browser)', () => {
    it('debe extraer sólo la primera parte de "inventory/items"', () => {
      expect(sanitizeRoute('inventory/items', false)).toBe('inventory');
    });

    it('debe extraer sólo la primera parte de "logistics/dispatch"', () => {
      expect(sanitizeRoute('logistics/dispatch', false)).toBe('logistics');
    });

    it('debe limpiar slashes iniciales de "/despacho"', () => {
      expect(sanitizeRoute('/despacho', false)).toBe('despacho');
    });

    it('debe manejar múltiples segmentos "/a/b/c"', () => {
      expect(sanitizeRoute('/a/b/c', false)).toBe('a');
    });
  });

  describe('Casos borde', () => {
    it('debe retornar string vacío para ruta vacía', () => {
      expect(sanitizeRoute('', false)).toBe('');
    });

    it('debe retornar string vacío para ruta null/undefined', () => {
      expect(sanitizeRoute(null as any, false)).toBe('');
    });
  });
});
