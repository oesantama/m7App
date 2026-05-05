import { describe, it, expect, beforeAll } from 'vitest';

const BACKEND_URL = 'http://localhost:8081/api';
const FRONTEND_URL = 'http://localhost:5173';

describe('Podman Deployment QA', () => {
    it('Backend should be healthy', async () => {
        const response = await fetch('http://localhost:8081/health');
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.status).toBe('UP');
    });

    it('Frontend should be accessible', async () => {
        const response = await fetch(FRONTEND_URL);
        expect(response.status).toBe(200);
    });

    it('Backend should respond to API requests', async () => {
        // Testing a public or simple endpoint
        const response = await fetch(`${BACKEND_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'wrong@email.com', password: 'wrong' })
        });
        // We expect a 401 or 400, but not a connection error
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
    });
});
