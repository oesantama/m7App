/**
 * Utilidades para detección de entorno (DEVELOP / PRODUCCIÓN) y metadatos de versión.
 */

// Variables globales inyectadas por Vite en tiempo de compilación
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD__: string | undefined;
declare const __APP_GIT__: string | undefined;

export interface VersionInfo {
  version: string;
  build: string;
  git: string;
  env: 'DEVELOP' | 'PROD';
  envLabel: string;
  fullVersionLabel: string;
}

export const getAppEnvironment = (): 'DEVELOP' | 'PROD' => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    // Identificar dominios de pruebas / desarrollo
    if (
      host.includes('dev') ||
      host.includes('qa') ||
      host.includes('test') ||
      host.includes('staging') ||
      host.includes('localhost') ||
      host.includes('127.0.0.1')
    ) {
      return 'DEVELOP';
    }
    // orbitm7.m7apps.com / apiapps.m7apps.com es producción
    if (host.includes('orbitm7') || host.includes('m7apps.com')) {
      return 'PROD';
    }
  }
  return 'PROD';
};

export const getVersionInfo = (): VersionInfo => {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.9.65';
  const build = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'live';
  const git = typeof __APP_GIT__ !== 'undefined' ? __APP_GIT__ : 'head';
  const env = getAppEnvironment();
  const envLabel = env === 'DEVELOP' ? 'QA • DEVELOP' : 'PRODUCCIÓN';

  return {
    version,
    build,
    git,
    env,
    envLabel,
    fullVersionLabel: `v${version}-${env === 'DEVELOP' ? 'dev' : 'prod'}.${build}`,
  };
};

