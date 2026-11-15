import { Page } from '@playwright/test';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  clientId: string;
  permissions: Array<{ module: string; actions: string[] }>;
}

export const ADMIN_TEST_USER: TestUser = {
  id: 'USR-DEV-01',
  name: 'OSCAR SANTAMARIA',
  email: 'directorti@millasiete.com',
  role: 'ADMINISTRADOR',
  roleId: 'ROL-01',
  clientId: 'CLI-01',
  permissions: [
    { module: 'USUARIOS', actions: ['view', 'create', 'edit', 'delete', 'super'] },
    { module: 'ROLES', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'DASHBOARD', actions: ['view'] },
    { module: 'CAPACITACIONES', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'PERSONAL_GH', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'VEHICULOS', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'CONDUCTORES', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'RUTAS', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'EXITO_MENSAJERIA', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'FULFILLMENT', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'BASC', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'DOGAMA', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'GRUPO_INTER', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'DICORP', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'DRIVE', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'INTELLIGENCE', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'ADMIN_DB', actions: ['view', 'create', 'edit', 'delete'] },
  ]
};

export const OPERATOR_TEST_USER: TestUser = {
  id: 'USR-DEV-02',
  name: 'OPERADOR LOGÍSTICO',
  email: 'operador@millasiete.com',
  role: 'OPERADOR',
  roleId: 'ROL-02',
  clientId: 'CLI-01',
  permissions: [
    { module: 'DASHBOARD', actions: ['view'] },
    { module: 'EXITO_MENSAJERIA', actions: ['view', 'create'] },
    { module: 'RUTAS', actions: ['view'] },
    { module: 'VEHICULOS', actions: ['view'] }
  ]
};

/**
 * Inyecta estado de autenticación en localStorage antes de navegar
 */
export async function authenticateSession(page: Page, user: TestUser = ADMIN_TEST_USER) {
  await page.addInitScript((mockUser) => {
    localStorage.setItem('m7_token', 'mock_qa_token_jwt_verified_session');
    localStorage.setItem('m7_user', JSON.stringify(mockUser));
    localStorage.setItem('orbitm7_sw_updated', 'true');
  }, user);
}

