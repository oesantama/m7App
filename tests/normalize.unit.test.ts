import { describe, it, expect } from 'vitest';
import { normalizeData } from '../utils/normalize';

describe('Utility - normalizeData', () => {
  it('should normalize snake_case Postgres fields to camelCase', () => {
    const rawData = [
      {
        id: '123',
        status_id: 'EST-01',
        module_id: 'MOD-01',
        created_at: '2026-02-28 11:00:00',
        notification_email: 'test@m7.com'
      }
    ];

    const result = normalizeData(rawData);
    expect(result[0].statusId).toBe('EST-01');
    expect(result[0].moduleId).toBe('MOD-01');
    expect(result[0].notificationEmail).toBe('test@m7.com');
  });

  it('should parse Postgres date format (space to T)', () => {
    const rawData = [
      {
        id: '123',
        created_at: '2026-02-28 11:00:00'
      }
    ];

    const result = normalizeData(rawData);
    expect(result[0].createdAt).toBe('2026-02-28T11:00:00');
  });

  it('should return an empty array if input is not an array', () => {
    expect(normalizeData(null)).toEqual([]);
    expect(normalizeData({})).toEqual([]);
  });

  it('should maintain original fields while adding normalized ones', () => {
    const rawData = [{ id: '1', custom_field: 'value' }];
    const result = normalizeData(rawData);
    expect(result[0].custom_field).toBe('value');
    expect(result[0].id).toBe('1');
  });
});
