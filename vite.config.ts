import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://m7app-backend:8080',
            changeOrigin: true,
            secure: false,
          }
        }
      },
      css: {
        postcss: './postcss.config.js',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['m7_favicon.png', 'm7_favicon.svg'],
          manifest: {
            name: 'Milla 7 - Sistema de Logística',
            short_name: 'M7 Logística',
            description: 'Sistema Inteligente de Gestión de Rutas',
            theme_color: '#10b981',
            background_color: '#020617',
            display: 'standalone',
            icons: [
              {
                src: 'm7_favicon.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: 'm7_favicon.png',
                sizes: '512x512',
                type: 'image/png'
              }
            ]
          }
        })
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
      optimizeDeps: {
        include: ['zustand']
      }
    };
});
