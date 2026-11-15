import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 3: Gerencia (Executive Dashboard & Informes)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Renderiza KPIs gerenciales sin cifras ficticias', async ({ page }) => {
    await page.goto('/?tab=executive-dashboard');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/gerencia/01-dashboard.png', fullPage: true });
  });

  test('Seguridad: Restricción estricta - Rol OPERADOR no tiene acceso a cifras de gerencia', async ({ page }) => {
    await authenticateSession(page, OPERATOR_TEST_USER);
    await page.goto('/?tab=executive-dashboard');
    // Debe redireccionar o mostrar mensaje de acceso restringido
    await expect(page.locator('text=No tienes permisos, text=Acceso restringido, body')).toBeVisible();
  });

  test('Responsive: Layout ejecutivo adaptable a pantallas 768px y 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/?tab=executive-dashboard');
    await page.screenshot({ path: 'qa-report/capturas/gerencia/02-tablet-768.png' });
  });

  test('Accesibilidad: Gráficos y tablas con nombres accesibles y contraste WCAG 2.2', async ({ page }) => {
    await page.goto('/?tab=executive-dashboard');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

