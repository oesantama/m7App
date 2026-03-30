import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Tests de integración HTTP corren en Node.js puro (sin DOM)
      ['**/backend/tests/integration/**', 'node'],
      ['**/*integration*', 'node'],
      ['**/*security*integration*', 'node'],
    ],
    setupFiles: './tests/setup.ts',
    // Excluir tests E2E de Playwright — se ejecutan con npx playwright test
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.{js,ts}',
        'dist/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@components': path.resolve(__dirname, './components'),
      '@utils': path.resolve(__dirname, './utils'),
      '@stores': path.resolve(__dirname, './stores'),
    }
  }
});
