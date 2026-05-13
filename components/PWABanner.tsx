import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

const PWABanner: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast.info('Nueva versión disponible', {
        description: 'Se han realizado mejoras en el sistema. Actualiza para ver los cambios.',
        duration: Infinity,
        action: {
          label: 'Actualizar',
          onClick: async () => {
            if ('caches' in window) {
              try {
                const cacheNames = await caches.keys();
                await Promise.all(
                  cacheNames.map((cacheName) => caches.delete(cacheName))
                );
                console.log('CacheStorage cleared successfully.');
              } catch (error) {
                console.error('Error clearing caches:', error);
              }
            }
            updateServiceWorker(true);
            setTimeout(() => {
              window.location.reload();
            }, 600);
          },
        },
        icon: <RefreshCw className="h-4 w-4 animate-spin" />,
      });
    }

    if (offlineReady) {
      toast.success('App lista para uso offline');
      setOfflineReady(false);
    }
  }, [needRefresh, offlineReady, updateServiceWorker, setOfflineReady, setNeedRefresh]);

  return null; // El componente solo gestiona las notificaciones vía sonner
};

export default PWABanner;
