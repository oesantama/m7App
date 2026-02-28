import { test, expect } from '@playwright/test';

test.describe('Módulo de Clientes - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', '1121837405');
    await page.fill('#password', 'admin123');
    await page.click('button:has-text("Acceder al Sistema")');
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });

  test('Debe listar clientes correctamente', async ({ page }) => {
    await page.click('text=/ADMINISTRACI/i');
    await page.click('text=/Clientes/i');
    await expect(page.locator('table, .grid')).toBeVisible();
  });

  test('Debe permitir crear un nuevo cliente', async ({ page }) => {
    await page.click('text=/ADMINISTRACI/i');
    await page.click('text=/Clientes/i');
    await page.click('button:has-text("Nuevo"), button:has-text("Agregar")');
    const randomId = `CLI-${Math.floor(Math.random() * 10000)}`;
    await page.fill('input[name="name"], input[placeholder*="Nombre"]', `Cliente Test ${randomId}`);
    await page.fill('input[name="document"], input[placeholder*="Documento"]', randomId);
    await page.click('button:has-text("Guardar")');
    await expect(page.locator(`text=${randomId}`)).toBeVisible();
  });
});
