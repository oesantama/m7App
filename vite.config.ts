import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
        react(),
        tailwindcss(),
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
