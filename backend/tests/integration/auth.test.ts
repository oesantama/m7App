// @vitest-environment node

const API_URL = 'http://localhost:8080/api/auth';

let authToken = '';

describe('Auth Integration Tests', () => {
    it('should login successfully with valid credentials', async () => {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@millasiete.com',
                    password: 'admin123'
                })
            });

            const data = await response.json();
            console.log('Login Response:', JSON.stringify({ success: data.success, hasToken: !!data.token }));

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);

            if (data.require2FA) {
                expect(data).toHaveProperty('userId');
            } else {
                expect(data.user).toHaveProperty('email', 'admin@millasiete.com');
                authToken = data.token;
            }
        } catch (e) {
            console.error('Login Test Failed:', e);
            throw e;
        }
    });

    it('should fail login with invalid credentials', async () => {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@millasiete.com',
                password: 'wrongpassword'
            })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
    });

    it('should logout successfully', async () => {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
    });
});
