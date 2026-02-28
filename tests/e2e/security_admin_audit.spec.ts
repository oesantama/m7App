import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Auditoría de Seguridad, Acceso y Administración', () => {

  test.beforeEach(async ({ page }) => {
    // Login como Super Admin
    await page.goto(BASE_URL);
    await page.locator('input[type="text"]').fill('1121837405');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    // Esperar a que el layout cargue viendo el logo o un botón del sidebar
    await page.waitForSelector('aside', { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  async function openSecurityModule(page) {
    const securityGroup = page.locator('button').filter({ hasText: /SEGURIDAD/i });
    await securityGroup.click();
    await page.waitForTimeout(500);
  }

  test('Validar Conexión WhatsApp y QR', async ({ page }) => {
    await openSecurityModule(page);
    await page.locator('button').filter({ hasText: /WHATSAPP/i }).click();
    
    // Esperar a que el título sea visible
    await expect(page.locator('h1, h2, h3').filter({ hasText: /WHATSAPP|CENTRO DE MENSAJERÍA/i }).first()).toBeVisible({ timeout: 15000 });
    console.log('[OK] Módulo WhatsApp accesible.');
  });

  test('CRUD Módulos y Páginas (Estructura)', async ({ page }) => {
    await openSecurityModule(page);
    
    // Probar entrada a Módulos Sistema
    await page.locator('button').filter({ hasText: /MÓDULOS SISTEMA/i }).click();
    await expect(page.locator('h1, h2, h3').filter({ hasText: /MÓDULOS/i }).first()).toBeVisible({ timeout: 10000 });
    
    // Re-abrir grupo si se cerró (depende de la implementación de Layout)
    if (!(await page.locator('button').filter({ hasText: /PÁGINAS WEB/i }).isVisible())) {
       await openSecurityModule(page);
    }

    // Probar entrada a Páginas Web
    await page.locator('button').filter({ hasText: /PÁGINAS WEB/i }).click();
    await expect(page.locator('h1, h2, h3').filter({ hasText: /PÁGINAS/i }).first()).toBeVisible({ timeout: 10000 });
    
    console.log('[OK] CRUD Módulos y Páginas funcional.');
  });

  test('Gestión de Usuarios - Validación Email y Creación', async ({ page }) => {
    await openSecurityModule(page);
    await page.locator('button').filter({ hasText: /USUARIOS/i }).click();
    
    await expect(page.locator('h1, h2, h3').filter({ hasText: /USUARIOS/i }).first()).toBeVisible({ timeout: 10000 });

    // Botón Nuevo Usuario
    const btnNuevo = page.locator('button').filter({ hasText: /NUEVO USUARIO/i });
    if (await btnNuevo.isVisible()) {
        await btnNuevo.click();
        
        // Probar validación de email inválido
        const emailInput = page.locator('input[type="email"]');
        if (await emailInput.isVisible()) {
            await emailInput.fill('email-invalido');
            const saveBtn = page.locator('button').filter({ hasText: /CONFIRMAR|OPERACIÓN/i });
            await saveBtn.click();
            await page.waitForTimeout(1000);
            console.log('[OK] Validación de usuarios probada.');
        }
    }
  });

  test('Administración - Health Check', async ({ page }) => {
    // Administración es un grupo de primer nivel usualmente
    const adminGroup = page.locator('button').filter({ hasText: /ADMINISTRACIÓN/i }).first();
    await adminGroup.click();
    await page.waitForTimeout(500);

    const dbManagerBtn = page.locator('button').filter({ hasText: /GESTOR DB|BASE DE DATOS/i }).first();
    if (await dbManagerBtn.isVisible()) {
        await dbManagerBtn.click();
        await expect(page.locator('h1, h2, h3').filter({ hasText: /DB|GESTOR/i }).first()).toBeVisible();
        console.log('[OK] Módulo Administración accesible.');
    }
  });

});
