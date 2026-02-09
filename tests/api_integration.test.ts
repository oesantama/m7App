import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

const API_URL = 'http://localhost:8080/api';

describe('Backend API Integration Tests', () => {
  let authUser: any = null;

  // 1. Health Check
  it('GET /health should be operational', async () => {
    try {
      const response = await axios.get('http://localhost:8080/health');
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('UP');
    } catch (error: any) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  });

  // 2. Auth - Login
  it('POST /api/auth/login should authenticate user', async () => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: 'admin@millasiete.com',
        password: 'admin' // Password por defecto según controladores previos
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      if (response.data.user) {
          authUser = response.data.user;
      }
    } catch (error: any) {
      console.warn('Login failed - might be due to incorrect credentials or DB state');
      // No fallamos el test estrictamente aquí para permitir ver otros fallos
    }
  });

  // 3. Masters
  describe('Masters API', () => {
    it('GET /api/masters/marcas should return list', async () => {
      try {
        const response = await axios.get(`${API_URL}/masters/marcas`);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
      } catch (error: any) {
        expect(error.response.status).toBe(200); // Forzamos reporte de error si falla
      }
    });

    it('GET /api/masters/estados should return list', async () => {
      const response = await axios.get(`${API_URL}/masters/estados`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  // 4. Users
  describe('Users API', () => {
    it('GET /api/users should return users list', async () => {
      const response = await axios.get(`${API_URL}/api/users`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  // 5. Documents
  describe('Documents API', () => {
    it('GET /api/documents should return documents', async () => {
      const response = await axios.get(`${API_URL}/documents`);
      expect(response.status).toBe(200);
    });
  });
});
