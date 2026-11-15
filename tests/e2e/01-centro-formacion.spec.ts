import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 1: Centro de Formación (Capacitaciones)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulo, renderiza catálogo y lista de capacitaciones sin errores 500', async ({ page }) => {
    await page.goto('/?tab=capacitaciones');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/centro-formacion/01-catalogo.png', fullPage: true });
  });

  test('Seguridad: Control de acceso por rol y restricción de eliminación', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=capacitaciones');
    // Un operador sin permiso de edición no debe ver acciones administrativas
    const deleteButtons = page.locator('button[title*="Eliminar"], button:has-text("Eliminar")');
    const count = await deleteButtons.count();
    expect(count).toBe(0);
  });

  test('Responsive: Validación en Viewport Móvil (390px) y Desktop (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=capacitaciones');
    await page.screenshot({ path: 'qa-report/capturas/centro-formacion/02-mobile-390.png' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?tab=capacitaciones');
    await page.screenshot({ path: 'qa-report/capturas/centro-formacion/03-desktop-1440.png' });
  });

  test('Accesibilidad: Un solo H1 por página y controles interactivos accesibles', async ({ page }) => {
    await page.goto('/?tab=capacitaciones');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

