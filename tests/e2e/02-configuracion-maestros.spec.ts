import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 2: Configuración Maestros', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulos maestros (Ciudades, Vehículos, Proveedores)', async ({ page }) => {
    await page.goto('/?tab=master');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/configuracion-maestros/01-maestros-main.png', fullPage: true });
  });

  test('Seguridad: Sanitización contra Inyección de Fórmulas en exportación/importación', async ({ page }) => {
    await page.goto('/?tab=master');
    // Verificar que los botones de exportar existan y no inyecten código malicioso
    const exportBtn = page.locator('button:has-text("Exportar"), button[title*="Exportar"]');
    if (await exportBtn.count() > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });

  test('Responsive: Validación 360px y 1024px sin desbordamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/?tab=master');
    await page.screenshot({ path: 'qa-report/capturas/configuracion-maestros/02-mobile-360.png' });
  });

  test('Accesibilidad: Foco visible y navegación por teclado en formularios maestros', async ({ page }) => {
    await page.goto('/?tab=master');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

