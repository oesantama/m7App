import { test, expect } from '@playwright/test';

test.describe('Módulo Usuarios - Auditoría Funcional & Seguridad', () => {
  test.beforeEach(async ({ page }) => {
    // Login inicial para obtener acceso al UI
    await page.goto('/');
    await page.fill('input[name="email"]', 'admin@millasiete.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button:has-text("Acceder al Sistema")');
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });

  test('CRUD Completo - Flujo Nominal', async ({ page }) => {
    // 1. Navegar a Usuarios
    await page.click('text=Usuarios');
    await expect(page).toHaveURL(/.*usuarios/);

    // 2. Crear Usuario
    await page.click('button:has-text("Nuevo Usuario")');
    await page.fill('input[placeholder*="Nombre"]', 'QA Tester Deep Audit');
    await page.fill('input[name="email"]', 'qa_deep@m7.com');
    await page.fill('input[name="password"]', 'Tester123!');
    await page.selectOption('select[name="role_id"]', 'ROL-02'); // Operador
    await page.click('button:has-text("Guardar")');

    // Validar creación (Toast o aparición en lista)
    await expect(page.locator('text=Usuario creado exitosamente').or(page.locator('text=QA Tester Deep Audit'))).toBeVisible();

    // 3. Editar Usuario
    await page.click('tr:has-text("QA Tester Deep Audit") button[title*="Editar"]');
    await page.fill('input[placeholder*="Nombre"]', 'QA Tester Edited');
    await page.click('button:has-text("Actualizar")');
    await expect(page.locator('text=QA Tester Edited')).toBeVisible();

    // 4. Eliminar Usuario
    await page.click('tr:has-text("QA Tester Edited") button[title*="Eliminar"]');
    await page.click('button:has-text("Confirmar")');
    await expect(page.locator('text=QA Tester Edited')).not.toBeVisible();
  });
});
