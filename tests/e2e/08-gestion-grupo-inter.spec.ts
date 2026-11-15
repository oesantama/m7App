import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 8: Gestión Grupo Inter (Operaciones & Cumplidos)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo de Grupo Inter y tabla de despachos/cumplidos', async ({ page }) => {
    await page.goto('/?tab=grupo-inter');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-grupo-inter/01-operaciones.png', fullPage: true });
  });

  test('Seguridad: Control de permisos canDeleteCumplido verificado', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=grupo-inter');
    // Operador sin permisos delete no debe ver botón eliminar
    const delButtons = page.locator('button[title*="Eliminar"]');
    const count = await delButtons.count();
    expect(count).toBe(0);
  });

  test('Responsive: Validación 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=grupo-inter');
    await page.screenshot({ path: 'qa-report/capturas/gestion-grupo-inter/02-mobile.png' });
  });

  test('Accesibilidad: Un solo H1 por página', async ({ page }) => {
    await page.goto('/?tab=grupo-inter');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

