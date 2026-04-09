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
          registerType: 'prompt',
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
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      // Un solo worker para reducir el pico de RAM en servidores con poca memoria
      maxParallelFileOps: 1,
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          // Librerias muy pesadas en chunks propios para que Rollup las procese por separado
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('xlsx')) return 'vendor-excel';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          if (id.includes('leaflet')) return 'vendor-maps';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react-dom')) return 'vendor-react-dom';
          if (id.includes('react')) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  },
      optimizeDeps: {
        include: ['zustand', 'react', 'react-dom']
      }
    };
});
