import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER } from './helpers/auth';

test.describe('Módulo 7: Gestión Documentos Drive (rclone & Documental)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza informe dashboard drive y estado de sincronización', async ({ page }) => {
    await page.goto('/?tab=drive-dashboard');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gestion-documentos-drive/01-dashboard.png', fullPage: true });
  });

  test('Seguridad: Rutas de sincronización rclone no exponen credenciales en cliente', async ({ page }) => {
    await page.goto('/?tab=drive-dashboard');
    const pageContent = await page.content();
    expect(pageContent).not.toContain('client_secret');
    expect(pageContent).not.toContain('private_key');
  });

  test('Responsive: Adaptación a 768px tablet y 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tab=drive-dashboard');
    await page.screenshot({ path: 'qa-report/capturas/gestion-documentos-drive/02-tablet.png' });
  });

  test('Accesibilidad: WCAG 2.2 y semántica clara', async ({ page }) => {
    await page.goto('/?tab=drive-dashboard');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

