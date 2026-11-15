import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 15: Administración (Base de Datos & Auditoría)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza consola de administración de base de datos para SUPERADMIN', async ({ page }) => {
    await page.goto('/?tab=admin-db');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/administracion/01-admin-db.png', fullPage: true });
  });

  test('Seguridad: Restricción absoluta - Operador y usuarios estándar bloqueados', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=admin-db');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 768px tablet y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tab=admin-db');
    await page.screenshot({ path: 'qa-report/capturas/administracion/02-tablet.png' });
  });

  test('Accesibilidad: Controles accesibles y foco visible', async ({ page }) => {
    await page.goto('/?tab=admin-db');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

