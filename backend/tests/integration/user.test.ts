
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = 'http://localhost:8080/api/users';
const TEST_USER_ID = 'USR-TEST-VITEST';

describe('User Integration Tests', () => {

    it('should create a new user', async () => {
        const response = await fetch(`${API_URL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: TEST_USER_ID,
                email: 'testuser@millasiete.com',
                name: 'Test User Vitest',
                password: 'password123',
                roleId: 'ROL-01',
                statusId: 'EST-01',
                clientIds: ['CLI-TEST-01'],
                phone: '1234567890',
                avatar: '',
                documentType: 'CC',
                documentNumber: '123456789',
                twoFactorEnabled: false
            })
        });

        const data = await response.json();
        console.log('Create User Response:', JSON.stringify(data));
        expect(response.status).toBe(200); // Controller returns 200 for success
        expect(data.success).toBe(true);
    });

    it('should get all users and find the created user', async () => {
        const response = await fetch(`${API_URL}`);
        expect(response.status).toBe(200);
        const users = await response.json();
        expect(Array.isArray(users)).toBe(true);
        const found = users.find((u: any) => u.id === TEST_USER_ID);
        expect(found).toBeDefined();
        expect(found.email).toBe('testuser@millasiete.com');
    });

    it('should update the user', async () => {
        const response = await fetch(`${API_URL}`, {
            method: 'POST', // saveUser handles update too
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: TEST_USER_ID,
                email: 'testuser_updated@millasiete.com',
                name: 'Test User Updated',
                // password not sent, should keep old one
                roleId: 'ROL-01',
                statusId: 'EST-01',
                clientIds: ['CLI-TEST-01']
            })
        });

        const data = await response.json();
        console.log('Update User Response:', JSON.stringify(data));
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify update
        const verifyResponse = await fetch(`${API_URL}`);
        const users = await verifyResponse.json();
        const found = users.find((u: any) => u.id === TEST_USER_ID);
        expect(found.name).toBe('Test User Updated');
        expect(found.email).toBe('testuser_updated@millasiete.com');
    });

    it('should delete the user', async () => {
        const response = await fetch(`${API_URL}/${TEST_USER_ID}?deletedBy=VITEST`, {
            method: 'DELETE'
        });

        const data = await response.json();
        console.log('Delete User Response:', JSON.stringify(data));
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify deletion
        const verifyResponse = await fetch(`${API_URL}`);
        const users = await verifyResponse.json();
        const found = users.find((u: any) => u.id === TEST_USER_ID);
        expect(found).toBeUndefined();
    });
});
