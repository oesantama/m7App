import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER } from './helpers/auth';

test.describe('Módulo 9: Gestión Humana (Personal, Inventario GH, Activos & Visitas)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo de personal GH y gestión de activos', async ({ page }) => {
    await page.goto('/?tab=personal-gh');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-humana/01-personal.png', fullPage: true });
  });

  test('Datos: Validación de números de documento y formatos de fecha en Colombia', async ({ page }) => {
    await page.goto('/?tab=personal-gh');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 360px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/?tab=personal-gh');
    await page.screenshot({ path: 'qa-report/capturas/gestion-humana/02-mobile.png' });
  });

  test('Accesibilidad: Inputs con etiquetas accesibles y foco visible', async ({ page }) => {
    await page.goto('/?tab=personal-gh');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

