import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        proxy: {
          '/api': {
            target: 'http://localhost:8080',
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['m7_favicon.png'],
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            navigateFallback: 'index.html',
            navigateFallbackDenylist: [/^\/api/],
          },
          manifest: {
            name: 'Milla 7 - Sistema de Logística',
            short_name: 'OrbitM7',
            description: 'Sistema Inteligente de Gestión de Rutas y Logística',
            theme_color: '#10b981',
            background_color: '#020617',
            display: 'standalone',
            orientation: 'portrait-primary',
            icons: [
              { src: 'm7-icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'm7-icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'm7-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
            ]
          }
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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
