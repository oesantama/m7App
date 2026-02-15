
import { describe, it, expect } from 'vitest';

// Replicating the logic from App.tsx lines 95-138
const normalize = (data: any[]) => {
    if (!Array.isArray(data)) return [];
    return data.map(item => {
      // Robustez absoluta para campos Postgres
      const getVal = (primary: string, secondary: string) => {
        // Mayúsculas/Minúsculas - Driver Postgres Docker
        // const pUpper = primary.toUpperCase(); // Unused in original but present
        // const sUpper = secondary.toUpperCase(); // Unused in original but present
        const keys = Object.keys(item);
        // Case insensitive search
        const findKey = (k: string) => keys.find(key => key.toLowerCase() === k.toLowerCase());
        
        const key = findKey(primary) || findKey(secondary) || primary || secondary;
        return (item[key] !== undefined && item[key] !== null) ? item[key] : undefined;
      };

      const parseDate = (val: any) => {
        if (!val) return undefined;
        if (typeof val === 'string') {
          // Postgres format: space instead of T
          if (val.includes(' ') && !val.includes('T')) return val.replace(' ', 'T');
        }
        return val;
      };

      return {
        ...item,
        statusId: getVal('statusId', 'status_id'),
        moduleId: getVal('moduleId', 'module_id'),
        iconClass: getVal('iconClass', 'icon_class'),
        roleId: getVal('roleId', 'role_id'),
        // Auditoría Normalizada
        createdAt: parseDate(getVal('createdAt', 'created_at')),
        updatedAt: parseDate(getVal('updatedAt', 'updated_at')),
        createdBy: getVal('createdBy', 'created_by'),
        updatedBy: getVal('updatedBy', 'updated_by'),
        // Sistema
        notificationEmail: getVal('notificationEmail', 'notification_email'),
        tipoNotificacionId: getVal('tipoNotificacionId', 'tipo_notificacion_id'),
        tipoNotificacionName: getVal('tipoNotificacionName', 'tipo_notificacion_name'),
        logoUrl: getVal('logoUrl', 'logo_url'),
        imageUrl: getVal('imageUrl', 'image_url')
      };
    });
};

describe('Date Normalization Logic (App.tsx replica)', () => {
    it('should handle standard camelCase input', () => {
        const input = [{ id: 1, createdAt: '2023-10-27T10:00:00', createdBy: 'User' }];
        const output = normalize(input);
        expect(output[0].createdAt).toBe('2023-10-27T10:00:00');
        expect(output[0].createdBy).toBe('User');
    });

    it('should handle snake_case input (common in DB)', () => {
        const input = [{ id: 1, created_at: '2023-10-27T10:00:00', created_by: 'User' }];
        const output = normalize(input);
        expect(output[0].createdAt).toBe('2023-10-27T10:00:00');
        expect(output[0].createdBy).toBe('User');
    });

    it('should handle UPPERCASE keys (Docker/Postgres driver quirck)', () => {
        const input = [{ id: 1, CREATED_AT: '2023-10-27T10:00:00', CREATED_BY: 'User' }];
        const output = normalize(input);
        expect(output[0].createdAt).toBe('2023-10-27T10:00:00');
        expect(output[0].createdBy).toBe('User');
    });

    it('should fix Postgres date format (space instead of T)', () => {
        const input = [{ id: 1, created_at: '2023-10-27 10:00:00' }];
        const output = normalize(input);
        expect(output[0].createdAt).toBe('2023-10-27T10:00:00');
    });

    it('should handle mixed quirks (Uppercase + Space date)', () => {
        const input = [{ id: 1, CREATED_AT: '2023-10-27 10:00:00' }];
        const output = normalize(input);
        expect(output[0].createdAt).toBe('2023-10-27T10:00:00');
    });

    it('should handle null/undefined gracefully', () => {
        const input = [{ id: 1, created_at: null }];
        const output = normalize(input);
        expect(output[0].createdAt).toBeUndefined();
    });
    
    it('should normalize masterUsuarios specifically', () => {
        const input = [{ 
            id: 'USR-01', 
            NAME: 'Juan', 
            EMAIL: 'juan@test.com',
            ROLE_ID: 'ROL-01',
            CREATED_AT: '2024-01-01 12:00:00'
        }];
        const output = normalize(input);
        expect(output[0].roleId).toBe('ROL-01');
        expect(output[0].createdAt).toBe('2024-01-01T12:00:00');
    });
});
