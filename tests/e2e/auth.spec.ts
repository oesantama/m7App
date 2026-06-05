import { test, expect } from '@playwright/test';

test.describe('Autenticación - Paridad E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('debe mostrar la página de login correctamente', async ({ page }) => {
    await expect(page).toHaveTitle(/OrbitM7/);
    await expect(page.locator('text=Logística Circular')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('intento de login fallido debe mostrar feedback (Paridad QA)', async ({ page }) => {
    await page.fill('input[name="email"]', 'wrong@m7.com');
    await page.fill('input[name="password"]', 'wrongpass');
    await page.click('button:has-text("Acceder al Sistema")');
    
    // Verificamos si aparece el mensaje de error (Hallazgo previo: posible bug en local)
    const errorMsg = page.locator('text=Usuario no registrado o identificador incorrecto');
    // En producción este mensaje aparece. Si en local no aparece, el test fallará, documentando la falta de paridad.
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });

  test('acceso exitoso con credenciales demo', async ({ page }) => {
    // Usamos las credenciales del .env que vimos previamente
    await page.fill('input[name="email"]', 'directorti@millasiete.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button:has-text("Acceder al Sistema")');

    // Al ser exitoso, debería redirigir o mostrar el Layout principal
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });
});
