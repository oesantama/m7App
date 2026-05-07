import { describe, it, expect } from 'vitest';
import {
  calculateTotalVolume,
  calculateUtilization,
  normalizeCityKey,
  detectPriority,
  detectTime,
  checkCapacityStatus,
  getDominantCity,
  calculateFleetDeficit,
  OPTIMIZATION_CONSTANTS
} from '../utils/routeUtils';

describe('routeUtils', () => {
  describe('calculateTotalVolume', () => {
    it('debe calcular el volumen total de facturas', () => {
      const invoices = [
        { id: '1', volumeM3: 5 },
        { id: '2', volumeM3: 3.5 },
        { id: '3', volumeM3: 2.5 }
      ] as any[];
      
      expect(calculateTotalVolume(invoices)).toBe(11);
    });

    it('debe manejar facturas sin volumen', () => {
      const invoices = [
        { id: '1', volumeM3: 5 },
        { id: '2' },
        { id: '3', volumeM3: null }
      ] as any[];
      
      expect(calculateTotalVolume(invoices)).toBe(5);
    });

    it('debe retornar 0 para array vacío', () => {
      expect(calculateTotalVolume([])).toBe(0);
    });
  });

  describe('calculateUtilization', () => {
    it('debe calcular utilización correctamente', () => {
      expect(calculateUtilization(27, 30)).toBe(90);
      expect(calculateUtilization(15, 30)).toBe(50);
    });

    it('debe usar fallback de 30m3 para capacidad 0', () => {
      expect(calculateUtilization(15, 0)).toBe(50);
    });

    it('debe redondear al entero más cercano', () => {
      expect(calculateUtilization(26.6, 30)).toBe(89);
      expect(calculateUtilization(26.7, 30)).toBe(89);
    });
  });

  describe('normalizeCityKey', () => {
    it('debe normalizar nombres de ciudad', () => {
      expect(normalizeCityKey('medellín')).toBe('MEDELLIN');
      expect(normalizeCityKey('Bogotá')).toBe('BOGOTA');
      expect(normalizeCityKey('CALI')).toBe('CALI');
    });

    it('debe manejar strings vacíos', () => {
      expect(normalizeCityKey('')).toBe('SIN_CIUDAD');
      expect(normalizeCityKey(null as any)).toBe('SIN_CIUDAD');
    });

    it('debe remover espacios', () => {
      expect(normalizeCityKey('  Medellín  ')).toBe('MEDELLIN');
    });
  });

  describe('detectPriority', () => {
    it('debe detectar palabras clave de prioridad', () => {
      expect(detectPriority('Entrega URGENTE')).toBe(true);
      expect(detectPriority('PRIMERA HORA por favor')).toBe(true);
      expect(detectPriority('Alta PRIORIDAD')).toBe(true);
    });

    it('debe ser case-insensitive', () => {
      expect(detectPriority('urgente')).toBe(true);
      expect(detectPriority('primera hora')).toBe(true);
    });

    it('debe retornar false si no hay prioridad', () => {
      expect(detectPriority('Entrega normal')).toBe(false);
      expect(detectPriority('')).toBe(false);
    });
  });

  describe('detectTime', () => {
    it('debe detectar horarios específicos', () => {
      expect(detectTime('Entregar a las 9 AM')).toBe('9 AM');
      expect(detectTime('Para las 2:30 PM')).toBe('2:30 PM');
      expect(detectTime('11 AM entrega')).toBe('11 AM');
    });

    it('debe retornar null si no hay horario', () => {
      expect(detectTime('Entregar hoy')).toBe(null);
      expect(detectTime('')).toBe(null);
    });
  });

  describe('checkCapacityStatus', () => {
    it('debe detectar estado crítico (>95%)', () => {
      expect(checkCapacityStatus(29, 30)).toBe('critical');
      expect(checkCapacityStatus(28.6, 30)).toBe('critical');
    });

    it('debe detectar advertencia (>90%)', () => {
      expect(checkCapacityStatus(27.5, 30)).toBe('warning');
      expect(checkCapacityStatus(27, 30)).toBe('warning');
    });

    it('debe retornar ok para cargas normales', () => {
      expect(checkCapacityStatus(25, 30)).toBe('ok');
      expect(checkCapacityStatus(15, 30)).toBe('ok');
    });

    it('debe usar fallback de capacidad', () => {
      expect(checkCapacityStatus(29, 0)).toBe('critical');
    });
  });

  describe('getDominantCity', () => {
    it('debe encontrar la ciudad más frecuente', () => {
      const invoices = [
        { city: 'Medellín' },
        { city: 'Medellín' },
        { city: 'Medellín' },
        { city: 'Cali' },
        { city: 'Cali' }
      ] as any[];
      
      expect(getDominantCity(invoices)).toBe('MEDELLIN');
    });

    it('debe manejar array vacío', () => {
      expect(getDominantCity([])).toBe('SIN_CIUDAD');
    });

    it('debe normalizar ciudades antes de contar', () => {
      const invoices = [
        { city: 'medellín' },
        { city: 'MEDELLÍN' },
        { city: 'Medellín' }
      ] as any[];
      
      expect(getDominantCity(invoices)).toBe('MEDELLIN');
    });
  });

  describe('calculateFleetDeficit', () => {
    it('debe calcular déficit correctamente', () => {
      const invoices = [
        { volumeM3: 10 },
        { volumeM3: 15 },
        { volumeM3: 20 }
      ] as any[];
      
      const vehicles = [
        { capacityM3: 30 },
        { capacityM3: 30 }
      ] as any[];
      
      const result = calculateFleetDeficit(invoices, vehicles);
      
      expect(result.count).toBe(3);
      expect(result.volume).toBe('45.00');
      expect(result.additionalVehicles).toBe(2); // 45/30 = 1.5 -> 2
    });

    it('debe usar capacidad por defecto si no hay vehículos', () => {
      const invoices = [{ volumeM3: 25 }] as any[];
      const result = calculateFleetDeficit(invoices, []);
      
      expect(result.additionalVehicles).toBe(3); // 25/10 = 2.5 -> 3
    });
  });

  describe('OPTIMIZATION_CONSTANTS', () => {
    it('debe tener constantes definidas correctamente', () => {
      expect(OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION).toBe(0.85);
      expect(OPTIMIZATION_CONSTANTS.MAX_UTILIZATION).toBe(0.90);
      expect(OPTIMIZATION_CONSTANTS.CRITICAL_THRESHOLD).toBe(0.92);
      expect(OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY).toBe(30);
      expect(OPTIMIZATION_CONSTANTS.OPTIMIZATION_DELAY).toBe(1200);
    });
  });
});
