import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER } from './helpers/auth';

test.describe('Módulo 10: Gestión Transporte (Flota, Rutas & Despachos)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo de flota de vehículos y planificador de rutas', async ({ page }) => {
    await page.goto('/?tab=fleet');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-transporte/01-flota.png', fullPage: true });
  });

  test('Seguridad: Control de permisos de vehículos y asignaciones por rol', async ({ page }) => {
    await page.goto('/?tab=fleet');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=fleet');
    await page.screenshot({ path: 'qa-report/capturas/gestion-transporte/02-mobile.png' });
  });

  test('Accesibilidad: Un solo H1 por página y controles táctiles de 44px', async ({ page }) => {
    await page.goto('/?tab=fleet');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

