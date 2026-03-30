// @vitest-environment node

const API_URL = 'http://localhost:8080';

describe('Health Check', () => {
  it('should return 200 OK', async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'UP');
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  });
});
