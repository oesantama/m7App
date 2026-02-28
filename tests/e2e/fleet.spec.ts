import { test, expect } from '@playwright/test';

test.describe('Módulo de Flotas - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', '1121837405');
    await page.fill('#password', 'admin123');
    await page.click('button:has-text("Acceder al Sistema")');
  });

  test('Debe visualizar la tabla de Vehículos', async ({ page }) => {
    await page.click('text=/ADMINISTRACI/i');
    await page.click('text=/Vehículos/i');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Placa")')).toBeVisible();
  });

  test('Debe visualizar la tabla de Conductores', async ({ page }) => {
    await page.click('text=/ADMINISTRACI/i');
    await page.click('text=/Conductores/i');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Nombre")')).toBeVisible();
  });
});
