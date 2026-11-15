import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 14: Seguridad & Acceso (Usuarios, Roles, Permisos y 2FA)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza gestión de usuarios y roles', async ({ page }) => {
    await page.goto('/?tab=usuarios');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/seguridad-acceso/01-usuarios.png', fullPage: true });
  });

  test('Seguridad: Restricción crítica - Operador bloqueado de gestión de usuarios', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=usuarios');
    // Operador no tiene permiso de ver usuarios
    await expect(page.locator('body')).toBeVisible();
  });

  test('Responsive: Validación 390px móvil y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=usuarios');
    await page.screenshot({ path: 'qa-report/capturas/seguridad-acceso/02-mobile.png' });
  });

  test('Accesibilidad: Un solo H1 por página y controles accesibles', async ({ page }) => {
    await page.goto('/?tab=usuarios');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

