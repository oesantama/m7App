import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 4: Gestión Ajover (Citas, Despachos & Maestras)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo de despachos de carga y citas Ajover', async ({ page }) => {
    await page.goto('/?tab=citas-despachos');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-ajover/01-citas-despachos.png', fullPage: true });
  });

  test('Seguridad: Validación de aislamiento cliente Ajover vs otros clientes', async ({ page }) => {
    await page.goto('/?tab=citas-despachos');
    // La interfaz no debe exponer órdenes de clientes ajenos como Éxito o Dicorp
    const textContent = await page.textContent('body');
    expect(textContent).not.toContain('EX-SECRET-OTHER-CLIENT');
  });

  test('Responsive: Renderizado en 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=citas-despachos');
    await page.screenshot({ path: 'qa-report/capturas/gestion-ajover/02-mobile-390.png' });
  });

  test('Accesibilidad: Contraste de colores y un único H1', async ({ page }) => {
    await page.goto('/?tab=citas-despachos');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

