import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

declare const __APP_VERSION__: string;

const PWABanner: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
      if (r) {
        // Check for updates in the background every 5 minutes
        setInterval(() => {
          r.update().catch(err => console.error('Error checking for SW update:', err));
        }, 5 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  // 1. Version check on mount: If the version compiled in __APP_VERSION__ is different
  // from the version stored in localStorage, we clear all caches and reload immediately.
  useEffect(() => {
    try {
      const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
      const lastVersion = localStorage.getItem('m7_app_version');

      if (lastVersion && lastVersion !== currentVersion) {
        console.log(`[PWA] Version upgrade detected: ${lastVersion} -> ${currentVersion}. Purging caches...`);
        localStorage.setItem('m7_app_version', currentVersion);
        
        if ('caches' in window) {
          caches.keys().then((cacheNames) => {
            Promise.all(cacheNames.map((name) => caches.delete(name)))
              .then(() => {
                console.log('[PWA] Caches cleared on version upgrade. Reloading...');
                window.location.reload();
              })
              .catch(() => window.location.reload());
          }).catch(() => window.location.reload());
        } else {
          window.location.reload();
        }
      } else if (!lastVersion) {
        localStorage.setItem('m7_app_version', currentVersion);
      }
    } catch (e) {
      console.error('[PWA] Error checking version in localStorage:', e);
    }
  }, []);

  // 2. SW update check: If the service worker detects a pending update,
  // we clear the cache, trigger update, and reload.
  useEffect(() => {
    if (needRefresh) {
      console.log('[PWA] New service worker version detected. Clearing cache and updating...');
      
      const performAutoUpdate = async () => {
        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames.map((cacheName) => caches.delete(cacheName))
            );
            console.log('[PWA] CacheStorage cleared successfully.');
          } catch (error) {
            console.error('[PWA] Error clearing CacheStorage:', error);
          }
        }
        updateServiceWorker(true);
        setNeedRefresh(false);
        
        setTimeout(() => {
          window.location.reload();
        }, 500);
      };

      performAutoUpdate();
    }

    if (offlineReady) {
      console.log('[PWA] App is ready for offline usage');
      setOfflineReady(false);
    }
  }, [needRefresh, offlineReady, updateServiceWorker, setOfflineReady, setNeedRefresh]);

  return null;
};

export default PWABanner;
