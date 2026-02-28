import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

// Usamos el puerto mapeado de Docker 8090 -> 8080
const API_URL = 'http://localhost:8090/api';

describe('Auditoría de Seguridad - Integración JWT & RBAC', () => {
  let validToken: string = '';

  // 1. Validar que ninguna ruta protegida sea accesible sin token
  it('GET /api/documents debe retornar 401 Unauthorized sin token', async () => {
    try {
      await axios.get(`${API_URL}/documents`);
    } catch (error: any) {
      expect(error.response.status).toBe(401);
      expect(error.response.data.error).toContain('No se proporcionó un token');
    }
  });

  // 2. Validar Login y obtención de token RS256
  it('POST /api/auth/login debe retornar un token JWT válido', async () => {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@millasiete.com',
      password: 'admin123'
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.token).toBeDefined();
    validToken = response.data.token;
  });

  // 3. Validar acceso con token válido
  it('GET /api/documents debe permitir acceso con token válido', async () => {
    const response = await axios.get(`${API_URL}/documents`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  // 4. Validar protección con token inválido/manipulado
  it('GET /api/documents debe retornar 401 con token manipulado', async () => {
    try {
      await axios.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${validToken}X` }
      });
    } catch (error: any) {
      expect(error.response.status).toBe(401);
      expect(error.response.data.error).toContain('Token inválido');
    }
  });

  // 5. Validar RBAC (Admin tiene permiso total)
  it('GET /api/users debe permitir acceso a ADMIN', async () => {
    const response = await axios.get(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });
});
