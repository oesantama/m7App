import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

declare const __APP_VERSION__: string;

declare global {
  interface Window {
    __orbitTriggerSWUpdate?: () => Promise<void>;
  }
}

const PWABanner: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Verificar periódicamente si hay nuevo service worker
        setInterval(() => {
          r.update().catch(() => {});
        }, 60 * 1000);
      }
    },
    onRegisterError() {},
  });

  // Cuando el Service Worker detecta una versión en espera (needRefresh),
  // se almacena la función de actualización y se emite la alerta interactiva
  // para que el usuario sea quien dé clic en Aceptar.
  useEffect(() => {
    if (needRefresh) {
      window.__orbitTriggerSWUpdate = async () => {
        try {
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((name) => caches.delete(name)));
          }
          await updateServiceWorker(true);
          setNeedRefresh(false);
        } catch (error) {
          console.warn('[PWA] Error activando nuevo service worker:', error);
        }
      };

      // Notificar al componente AutoUpdate para mostrar el modal con botón Aceptar
      window.dispatchEvent(
        new CustomEvent('orbit-new-version-available', {
          detail: { reason: 'sw-need-refresh' },
        })
      );
    }

    if (offlineReady) {
      setOfflineReady(false);
    }
  }, [needRefresh, offlineReady, updateServiceWorker, setOfflineReady, setNeedRefresh]);

  return null;
};

export default PWABanner;
