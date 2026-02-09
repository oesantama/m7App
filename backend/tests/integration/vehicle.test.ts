
import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:8080/api/vehicles';
const TEST_VEHICLE_ID = 'VEH-TEST-VITEST';
const TEST_PLATE = 'VIT-999';

describe('Vehicle Integration Tests', () => {

    it('should create a new vehicle', async () => {
        const response = await fetch(`${API_URL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: TEST_VEHICLE_ID,
                plate: TEST_PLATE,
                brand: 'Chevrolet',
                owner: 'Test Owner',
                capacityM3: 15.5,
                clientId: 'CLI-TEST-01',
                statusId: 'EST-01',
                modelYear: '2023',
                color: 'Blanco',
                vehicleType: 'TV-01'
            })
        });

        const data = await response.json();
        console.log('Create Vehicle Response:', JSON.stringify(data));
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
    });

    it('should get all vehicles and find the created vehicle', async () => {
        const response = await fetch(`${API_URL}`);
        expect(response.status).toBe(200);
        const vehicles = await response.json();
        expect(Array.isArray(vehicles)).toBe(true);
        const found = vehicles.find((v: any) => v.id === TEST_VEHICLE_ID);
        expect(found).toBeDefined();
        expect(found.plate).toBe(TEST_PLATE);
    });

    it('should update the vehicle', async () => {
        const response = await fetch(`${API_URL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: TEST_VEHICLE_ID,
                plate: TEST_PLATE,
                brand: 'Chevrolet Updated',
                owner: 'Test Owner Updated',
                capacityM3: 20.0,
                clientId: 'CLI-TEST-01',
                statusId: 'EST-01',
                color: 'Negro'
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify update
        const verifyResponse = await fetch(`${API_URL}`);
        const vehicles = await verifyResponse.json();
        const found = vehicles.find((v: any) => v.id === TEST_VEHICLE_ID);
        expect(found.brand).toBe('Chevrolet Updated');
        expect(found.color).toBe('Negro');
    });

    it('should soft delete the vehicle', async () => {
        const response = await fetch(`${API_URL}/${TEST_VEHICLE_ID}?deletedBy=VITEST`, {
            method: 'DELETE'
        });

        const data = await response.json();
        console.log('Delete Vehicle Response:', JSON.stringify(data));
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify deletion (getVehicles filters out deleted ones)
        const verifyResponse = await fetch(`${API_URL}`);
        const vehicles = await verifyResponse.json();
        const found = vehicles.find((v: any) => v.id === TEST_VEHICLE_ID);
        expect(found).toBeUndefined();
    });
});
