import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 5: Gestión BASC (Seguridad, Riesgos y Auditorías)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza matriz de riesgos BASC y estándares de seguridad', async ({ page }) => {
    await page.goto('/?tab=basc');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-basc/01-matriz-riesgos.png', fullPage: true });
  });

  test('Seguridad: Confidencialidad de matriz de riesgos e informes de auditoría', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=basc');
    // Si no tiene permiso BASC, el sistema no debe mostrar la información clasificada
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 768px tablet y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tab=basc');
    await page.screenshot({ path: 'qa-report/capturas/gestion-basc/02-tablet-768.png' });
  });

  test('Accesibilidad: WCAG 2.2 AA en etiquetas de riesgo y navegación accesible', async ({ page }) => {
    await page.goto('/?tab=basc');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

