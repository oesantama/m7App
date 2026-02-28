import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../services/api';

describe('API Service - Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('login should return success when credentials are valid', async () => {
    const mockResponse = { success: true, user: { id: 'USR-01', name: 'Admin' } };
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await api.login('admin@millasiete.com', 'admin123');
    expect(result.success).toBe(true);
    expect(result.user.name).toBe('Admin');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.any(Object));
  });

  it('login should return error when credentials are invalid (401)', async () => {
    const mockResponse = { success: false, error: 'Credenciales inválidas' };
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => mockResponse,
    });

    const result = await api.login('wrong@email.com', 'wrongpass');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Credenciales inválidas');
  });

  it('login should throw error on network failure', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network Error'));

    await expect(api.login('admin@millasiete.com', 'admin123')).rejects.toThrow('Network Error');
  });
});
