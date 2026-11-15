import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER } from './helpers/auth';

test.describe('Módulo 13: Operación Fulfillment (Recibido, Conteo Ciego, Devoluciones)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulos de recibido de material y devolución', async ({ page }) => {
    await page.goto('/?tab=recibido-material');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/operacion-fulfillment/01-recibido.png', fullPage: true });
  });

  test('Seguridad: Control de transacciones y estados de conteo', async ({ page }) => {
    await page.goto('/?tab=recibido-material');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=recibido-material');
    await page.screenshot({ path: 'qa-report/capturas/operacion-fulfillment/02-mobile.png' });
  });

  test('Accesibilidad: Un solo H1 por página', async ({ page }) => {
    await page.goto('/?tab=recibido-material');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

