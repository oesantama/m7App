/**
 * Tests unitarios: Importación masiva de vehículos (DataImportDialog)
 * Verifica la lógica de getKeyValue y el comportamiento de UPSERT
 */
import { describe, it, expect } from 'vitest';

// Replicar la función getKeyValue de DataImportDialog para testear
const getKeyValueForMaster = (item: any, masterType: string): string => {
  if (masterType === 'masterVehiculos') {
    return (item.PLATE || item.plate || '').toString().trim();
  }
  if (masterType === 'masterConductores') {
    return (item.DOCUMENT_NUMBER || item.documentNumber || item.DOCUMENTNUMBER || '').toString().trim();
  }
  return (item.sku || item.email || item.name || '').toString().trim();
};

describe('DataImportDialog: getKeyValue', () => {
  describe('masterVehiculos', () => {
    it('debe leer la placa desde columna PLATE (mayúsculas - Excel)', () => {
      const item = { PLATE: 'ABC123', BRAND: 'BYD' };
      expect(getKeyValueForMaster(item, 'masterVehiculos')).toBe('ABC123');
    });

    it('debe leer la placa desde columna plate (minúsculas - JSON)', () => {
      const item = { plate: 'XYZ789' };
      expect(getKeyValueForMaster(item, 'masterVehiculos')).toBe('XYZ789');
    });

    it('debe priorizar PLATE sobre plate', () => {
      const item = { PLATE: 'CORRECTO', plate: 'INCORRECTO' };
      expect(getKeyValueForMaster(item, 'masterVehiculos')).toBe('CORRECTO');
    });

    it('debe retornar string vacío si no tiene placa', () => {
      const item = { BRAND: 'BYD', CAPACITY: 30 };
      expect(getKeyValueForMaster(item, 'masterVehiculos')).toBe('');
    });

    it('debe hacer trim de espacios', () => {
      const item = { PLATE: '  ABC 123  ' };
      expect(getKeyValueForMaster(item, 'masterVehiculos')).toBe('ABC 123');
    });
  });

  describe('masterConductores', () => {
    it('debe leer número de documento (Excel formato DOCUMENT_NUMBER)', () => {
      const item = { DOCUMENT_NUMBER: '12345678' };
      expect(getKeyValueForMaster(item, 'masterConductores')).toBe('12345678');
    });

    it('debe leer número de documento (JSON formato documentNumber)', () => {
      const item = { documentNumber: '87654321' };
      expect(getKeyValueForMaster(item, 'masterConductores')).toBe('87654321');
    });

    it('debe retornar string vacío si no tiene documento', () => {
      const item = { name: 'Juan Pérez' };
      expect(getKeyValueForMaster(item, 'masterConductores')).toBe('');
    });
  });

  describe('otros maestros (nombre/sku/email)', () => {
    it('debe retornar sku si existe', () => {
      const item = { sku: 'ART-001', name: 'Artículo' };
      expect(getKeyValueForMaster(item, 'masterArticulo')).toBe('ART-001');
    });

    it('debe retornar email si no hay sku', () => {
      const item = { email: 'test@test.com', name: 'Usuario' };
      expect(getKeyValueForMaster(item, 'masterUsuarios')).toBe('test@test.com');
    });

    it('debe retornar name como fallback', () => {
      const item = { name: 'Mi Categoría' };
      expect(getKeyValueForMaster(item, 'masterCategorias')).toBe('Mi Categoría');
    });

    it('debe retornar vacío si ningún campo existe', () => {
      const item = { description: 'Solo descripción' };
      expect(getKeyValueForMaster(item, 'masterCategorias')).toBe('');
    });
  });
});

describe('DataImportDialog: Lógica de duplicados', () => {
  const validateDuplicates = (data: any[], existingKeys: Set<string>, masterType: string) => {
    const internalSet = new Set<string>();
    const errors: string[] = [];
    let updateCount = 0;

    data.forEach((item, index) => {
      const value = getKeyValueForMaster(item, masterType);
      if (!value) {
        errors.push(`Fila ${index + 1}: campo identificador vacío`);
        return;
      }
      const valueLower = value.toLowerCase();
      if (internalSet.has(valueLower)) {
        errors.push(`Fila ${index + 1}: "${value}" duplicado en el Excel`);
      }
      if (existingKeys.has(valueLower)) {
        updateCount++;
      }
      internalSet.add(valueLower);
    });

    return { errors, updateCount, newCount: data.length - updateCount - errors.length };
  };

  it('debe detectar duplicados dentro del Excel', () => {
    const data = [
      { PLATE: 'ABC123' },
      { PLATE: 'XYZ789' },
      { PLATE: 'ABC123' }, // Duplicado
    ];
    const { errors } = validateDuplicates(data, new Set(), 'masterVehiculos');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ABC123');
  });

  it('NO debe generar error para duplicados en sistema (son UPDATES)', () => {
    const data = [{ PLATE: 'ABC123' }, { PLATE: 'XYZ789' }];
    const existingKeys = new Set(['abc123']); // ABC123 ya existe
    const { errors, updateCount } = validateDuplicates(data, existingKeys, 'masterVehiculos');
    expect(errors).toHaveLength(0);
    expect(updateCount).toBe(1);
  });

  it('debe contar correctamente nuevos vs actualizados', () => {
    const data = [
      { PLATE: 'NUEVO-01' },
      { PLATE: 'EXISTE-01' },
      { PLATE: 'NUEVO-02' },
      { PLATE: 'EXISTE-02' },
    ];
    const existingKeys = new Set(['existe-01', 'existe-02']);
    const { updateCount, newCount } = validateDuplicates(data, existingKeys, 'masterVehiculos');
    expect(updateCount).toBe(2);
    expect(newCount).toBe(2);
  });

  it('debe manejar placas con espacios o mayúsculas diferentes', () => {
    const data = [{ PLATE: '  ABC 123  ' }];
    const existingKeys = new Set(['abc 123']); // trim + lowercase
    const { updateCount } = validateDuplicates(data, existingKeys, 'masterVehiculos');
    expect(updateCount).toBe(1);
  });
});
