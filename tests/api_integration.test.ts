// @vitest-environment node

const API_URL = 'http://localhost:8080/api';

describe('Backend API Integration Tests', () => {
  let authToken: string = '';

  beforeAll(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'directorti@millasiete.com', password: 'admin123' })
      });
      const data = await res.json();
      authToken = data.token || '';
    } catch (e) {
      console.warn('beforeAll login failed:', e);
    }
  });

  const authHeader = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  });

  // 1. Health Check
  it('GET /health should be operational', async () => {
    const res = await fetch('http://localhost:8080/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('UP');
  });

  // 2. Auth - Login
  it('POST /api/auth/login should authenticate user', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'directorti@millasiete.com', password: 'admin123' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
  });

  // 3. Masters (requieren auth)
  describe('Masters API', () => {
    it('GET /api/marcas should return list', async () => {
      const res = await fetch(`${API_URL}/marcas`, { headers: authHeader() });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/estados should return list', async () => {
      const res = await fetch(`${API_URL}/estados`, { headers: authHeader() });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // 4. Users (requieren auth)
  describe('Users API', () => {
    it('GET /api/users should return users list', async () => {
      const res = await fetch(`${API_URL}/users`, { headers: authHeader() });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // 5. Documents (requieren auth)
  describe('Documents API', () => {
    it('GET /api/documents should return documents', async () => {
      const res = await fetch(`${API_URL}/documents`, { headers: authHeader() });
      expect(res.status).toBe(200);
    });
  });

  // 6. Inventory Log
  describe('Inventory Log API', () => {
    it('GET /api/documents/inventory-log sin auth should return 401', async () => {
      const res = await fetch(`${API_URL}/documents/inventory-log`);
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/documents/inventory-log con admin token should return array', async () => {
      const res = await fetch(`${API_URL}/documents/inventory-log`, { headers: authHeader() });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('clientId');
        expect(data[0]).toHaveProperty('articleId');
        expect(data[0]).toHaveProperty('quantity');
        expect(data[0]).toHaveProperty('lastUpdated');
      }
    });
  });
});
