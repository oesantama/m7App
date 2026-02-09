import { describe, it, expect } from 'vitest';
import {
  M7_HUB_ORIGIN,
  calculateDistance,
  normalizeCityName
} from '../utils/mapUtils';

describe('mapUtils', () => {
  describe('M7_HUB_ORIGIN', () => {
    it('debe tener coordenadas definidas', () => {
      expect(M7_HUB_ORIGIN.lat).toBe(6.110595);
      expect(M7_HUB_ORIGIN.lng).toBe(-75.641505);
      expect(M7_HUB_ORIGIN.address).toContain('La Tablaza');
    });
  });

  describe('calculateDistance', () => {
    it('debe calcular distancia entre dos puntos', () => {
      // Medellín a Bogotá (aprox 240km en línea recta)
      const medellin = { lat: 6.2442, lng: -75.5812 };
      const bogota = { lat: 4.7110, lng: -74.0721 };
      
      const distance = calculateDistance(
        medellin.lat, medellin.lng,
        bogota.lat, bogota.lng
      );
      
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(300);
    });

    it('debe retornar 0 para el mismo punto', () => {
      const distance = calculateDistance(6.2442, -75.5812, 6.2442, -75.5812);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('debe calcular distancia desde HUB', () => {
      const target = { lat: 6.2442, lng: -75.5812 };
      const distance = calculateDistance(
        M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng,
        target.lat, target.lng
      );
      
      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('normalizeCityName', () => {
    it('debe normalizar nombres de ciudad', () => {
      expect(normalizeCityName('Medellín')).toBe('MEDELLIN');
      expect(normalizeCityName('Bogotá')).toBe('BOGOTA');
      expect(normalizeCityName('Cali')).toBe('CALI');
    });

    it('debe remover espacios y convertir a mayúsculas', () => {
      expect(normalizeCityName('  medellín  ')).toBe('MEDELLIN');
      expect(normalizeCityName('san josé')).toBe('SAN JOSE');
    });

    it('debe remover acentos', () => {
      expect(normalizeCityName('Pereira')).toBe('PEREIRA');
      expect(normalizeCityName('Cúcuta')).toBe('CUCUTA');
    });
  });
});
