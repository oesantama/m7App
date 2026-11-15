import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Generar identificador automático de build y commit para CI/CD
    const gitCommit = (() => {
      try {
        return execSync('git rev-parse --short HEAD').toString().trim();
      } catch {
        return 'live';
      }
    })();

    const now = new Date();
    const buildTime = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    const appVersion = pkg.version || '1.9.65';

    return {
      server: {
        proxy: {
          '/api': {
            target: env.VITE_PROXY_TARGET || 'http://backend-podman:8080',
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [
        react(),
        tailwindcss(),
        // Plugin personalizado para emitir siempre dist/version.json en cada compilación
        {
          name: 'generate-version-json',
          generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: 'version.json',
              source: JSON.stringify({
                version: appVersion,
                build: buildTime,
                git: gitCommit,
                timestamp: now.toISOString(),
              }, null, 2)
            });
          }
        },
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['m7_favicon.png'],
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            navigateFallback: 'index.html',
            navigateFallbackDenylist: [/^\/api/, /^\/publico\//, /^\/documentacion\//, /\.html$/, /version\.json$/],
          },
          manifest: {
            name: 'Milla 7 - Sistema de Logística',
            short_name: 'OrbitM7',
            description: 'Sistema Inteligente de Gestión de Rutas y Logística',
            theme_color: '#10b981',
            background_color: '#020617',
            display: 'standalone',
            orientation: 'any',
            icons: [
              { src: 'm7-icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'm7-icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'm7-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
            ]
          }
        }),
      ],
      define: {
        '__APP_VERSION__': JSON.stringify(appVersion),
        '__APP_BUILD__': JSON.stringify(buildTime),
        '__APP_GIT__': JSON.stringify(gitCommit),
        'global': 'window',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        minify: 'esbuild',
        sourcemap: false,
        chunkSizeWarningLimit: 3000,
        rollupOptions: {
          maxParallelFileOps: 2,
          output: {
            // Separa las librerias pesadas en chunks propios para que el navegador
            // las cachee independientemente del codigo de la app.
            // xlsx (420 KB) y jspdf (411 KB) solo se descargan cuando el usuario
            // abre un modulo de exportacion por primera vez.
            manualChunks(id) {
              if (id.includes('node_modules/xlsx'))         return 'vendor-xlsx';
              if (id.includes('node_modules/jspdf'))        return 'vendor-jspdf';
              if (id.includes('node_modules/html2canvas'))  return 'vendor-html2canvas';
              if (id.includes('node_modules/leaflet'))      return 'vendor-leaflet';
              if (id.includes('node_modules/recharts') ||
                  id.includes('node_modules/d3-'))          return 'vendor-charts';
              if (id.includes('node_modules/react') ||
                  id.includes('node_modules/react-dom'))    return 'vendor-react';
            },
          },
        },
      },
      optimizeDeps: {
        include: ['zustand', 'react', 'react-dom']
      }
    };
});
