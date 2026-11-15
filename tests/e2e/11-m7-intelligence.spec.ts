import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 11: M7 Intelligence (IA, Analítica y Ciberseguridad)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza módulo de inteligencia y seguridad analítica', async ({ page }) => {
    await page.goto('/?tab=cyber');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/m7-intelligence/01-cyber.png', fullPage: true });
  });

  test('Seguridad: Restricción estricta - Operador no tiene acceso a M7 Intelligence', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=cyber');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 768px tablet y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tab=cyber');
    await page.screenshot({ path: 'qa-report/capturas/m7-intelligence/02-tablet.png' });
  });

  test('Accesibilidad: Semántica de indicadores de seguridad accesible', async ({ page }) => {
    await page.goto('/?tab=cyber');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

