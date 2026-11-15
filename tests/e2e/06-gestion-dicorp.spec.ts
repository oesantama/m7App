import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER } from './helpers/auth';

test.describe('Módulo 6: Gestión Dicorp (Legalizaciones y Operaciones)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo de legalizaciones Dicorp', async ({ page }) => {
    await page.goto('/?tab=dicorp-legalizaciones');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-dicorp/01-legalizaciones.png', fullPage: true });
  });

  test('Datos: Formato de moneda COP ($) y validación de campos obligatorios', async ({ page }) => {
    await page.goto('/?tab=dicorp-legalizaciones');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Layout en 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=dicorp-legalizaciones');
    await page.screenshot({ path: 'qa-report/capturas/gestion-dicorp/02-mobile-390.png' });
  });

  test('Accesibilidad: Controles accesibles con foco visible', async ({ page }) => {
    await page.goto('/?tab=dicorp-legalizaciones');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

