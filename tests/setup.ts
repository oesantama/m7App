// tests/setup.ts
import { beforeAll } from 'vitest';

beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_m7';
});
