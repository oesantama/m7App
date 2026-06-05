// @vitest-environment node

const API_URL = 'http://localhost:8080/api';

describe('Auditoría de Seguridad - Integración JWT & RBAC', () => {
  let validToken: string = '';

  beforeAll(async () => {
    // Obtener token antes de los tests que lo requieren
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'directorti@millasiete.com', password: 'admin123' })
      });
      const data = await res.json();
      validToken = data.token || '';
    } catch (e) {
      console.warn('beforeAll login failed:', e);
    }
  });

  // 1. Ruta protegida sin token → 401
  it('GET /api/documents debe retornar 401 Unauthorized sin token', async () => {
    const res = await fetch(`${API_URL}/documents`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('No se proporcionó un token');
  });

  // 2. Login y obtención de token RS256
  it('POST /api/auth/login debe retornar un token JWT válido', async () => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'directorti@millasiete.com', password: 'admin123' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
  });

  // 3. Acceso con token válido
  it('GET /api/documents debe permitir acceso con token válido', async () => {
    const res = await fetch(`${API_URL}/documents`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // 4. Token manipulado → 401
  it('GET /api/documents debe retornar 401 con token manipulado', async () => {
    const res = await fetch(`${API_URL}/documents`, {
      headers: { 'Authorization': `Bearer ${validToken}X` }
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Token inválido');
  });

  // 5. RBAC: admin tiene acceso total
  it('GET /api/users debe permitir acceso a ADMIN', async () => {
    const res = await fetch(`${API_URL}/users`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
