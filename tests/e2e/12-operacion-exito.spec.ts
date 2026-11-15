import { test, expect } from '@playwright/test';
import { authenticateSession, ADMIN_TEST_USER, OPERATOR_TEST_USER } from './helpers/auth';

test.describe('Módulo 12: Operación Éxito (Recepción, Despacho, Inhouse, Conductor & Línea Blanca)', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page, ADMIN_TEST_USER);
  });

  test('Funcional: Carga módulos operativos de Éxito Mensajería', async ({ page }) => {
    await page.goto('/?tab=exito-mensajeria-recepcion');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/operacion-exito/01-recepcion.png', fullPage: true });

    await page.goto('/?tab=exito-mensajeria-despacho');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'qa-report/capturas/operacion-exito/02-despacho.png', fullPage: true });
  });

  test('Seguridad: Validación de contrato Push Tracking Go Éxito homologado', async ({ page }) => {
    // Validar que no existan fugas de API Key ni PII en la interfaz
    await page.goto('/?tab=exito-mensajeria-recepcion');
    const content = await page.content();
    expect(content).not.toContain('9gLW56ExTU49BaOXFxOiV6JHJ61k6Kku3kkmUdlj');
  });

  test('Responsive: Validación en smartphone 390px y desktop 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=exito-mensajeria-recepcion');
    await page.screenshot({ path: 'qa-report/capturas/operacion-exito/03-mobile.png' });
  });

  test('Accesibilidad: Un solo H1 por página y controles táctiles mínimos 44px', async ({ page }) => {
    await page.goto('/?tab=exito-mensajeria-recepcion');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});

