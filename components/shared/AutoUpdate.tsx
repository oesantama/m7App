import React, { useEffect, useState, useCallback } from 'react';
import { getVersionInfo, getAppEnvironment } from '../../utils/env';
import { api } from '../../services/api';
import { RefreshCw, Sparkles, X } from 'lucide-react';

interface ServerVersionMeta {
  version?: string;
  build?: string;
  git?: string;
  timestamp?: string;
  env?: string;
}

/**
 * Componente que detecta automáticamente si hay una nueva versión del sistema
 * (desplegada en develop o producción) y notifica al usuario con una alerta
 * interactiva para que dé clic en Aceptar y recargue la aplicación limpiamente.
 */
const AutoUpdate: React.FC = () => {
  const localInfo = getVersionInfo();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newMeta, setNewMeta] = useState<ServerVersionMeta | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Verificación contra /version.json y contra /api/health
  const checkServerVersion = useCallback(async () => {
    try {
      // 1. Consultar archivo estático /version.json con cache-busting
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });

      if (res.ok) {
        const data: ServerVersionMeta = await res.json();
        
        // Comparar build o version
        const serverBuild = String(data.build || '').trim();
        const serverVer = String(data.version || '').trim();
        const localBuild = String(localInfo.build || '').trim();
        const localVer = String(localInfo.version || '').trim();

        const isBuildChanged = serverBuild && localBuild && serverBuild !== localBuild;
        const isVerChanged = serverVer && localVer && serverVer !== localVer;

        if (isBuildChanged || isVerChanged) {
          console.log(`[ORBIT-UPDATE] Nueva versión detectada: Servidor(${serverVer} - ${serverBuild}) vs Local(${localVer} - ${localBuild})`);
          setNewMeta(data);
          setUpdateAvailable(true);
          return;
        }
      }
    } catch {
      // Fallback secundario a health check si version.json aún no estuviera disponible
      try {
        const health = await api.getHealth();
        if (health && health.version && health.version !== localInfo.version) {
          setNewMeta({ version: health.version, build: (health as any).build });
          setUpdateAvailable(true);
        }
      } catch {}
    }
  }, [localInfo.build, localInfo.version]);

  useEffect(() => {
    // 1. Chequeo inicial a los 5 segundos de arrancar
    const initTimer = setTimeout(() => {
      checkServerVersion();
    }, 5000);

    // 2. Intervalo periódico cada 45 segundos para detección rápida
    const interval = setInterval(checkServerVersion, 45 * 1000);

    // 3. Verificación inmediata cuando el usuario regresa a la pestaña (Visibility Change)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkServerVersion();
      }
    };

    window.addEventListener('focus', checkServerVersion);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener('focus', checkServerVersion);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkServerVersion]);

  // Manejo de error de chunks (cuando el deploy elimina chunks viejos en Nginx)
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (e.message && (e.message.includes('ChunkLoadError') || e.message.includes('Loading chunk'))) {
        console.warn('[ORBIT-UPDATE] Fragmento obsoleto detectado. Forzando actualización...');
        handleAcceptUpdate();
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Acción al dar clic en Aceptar
  const handleAcceptUpdate = async () => {
    setIsUpdating(true);
    try {
      // Limpiar todas las cachés del navegador / Service Worker
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Si hay service worker activo, pedirle que tome control
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
    } catch (err) {
      console.warn('[ORBIT-UPDATE] Error limpiando caché previa:', err);
    }

    // Pequeño retardo visual y recarga dura forzada
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  if (!updateAvailable || isDismissed) {
    return null;
  }

  const env = getAppEnvironment();
  const envName = env === 'DEVELOP' ? 'QA • DEVELOP' : 'PRODUCCIÓN';

  return (
    <div className="fixed bottom-5 right-5 z-[9999] max-w-md w-full animate-in slide-in-from-bottom-5 duration-300 px-4 md:px-0">
      <div className="bg-slate-900/95 backdrop-blur-xl border-2 border-emerald-500/40 rounded-3xl p-5 shadow-2xl shadow-emerald-500/20 text-white relative overflow-hidden">
        {/* Glow de fondo */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-sm tracking-tight text-white uppercase">
                  Nueva Versión Disponible
                </h4>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                  env === 'DEVELOP'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {envName}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Versión <span className="font-bold text-white">v{newMeta?.version || localInfo.version}</span>
                {newMeta?.build ? <span className="text-slate-400 font-mono text-[10px]"> (Build {newMeta.build})</span> : null}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            title="Posponer"
            className="text-slate-500 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-300 mt-3 leading-relaxed relative z-10">
          Se han publicado mejoras y ajustes en el sistema. Para disfrutar de los cambios más recientes, haz clic en <strong className="text-emerald-400">Aceptar</strong>.
        </p>

        <div className="flex items-center justify-end gap-2.5 mt-4 relative z-10">
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="px-3.5 py-2 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-wider transition-colors rounded-xl"
          >
            Más tarde
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={handleAcceptUpdate}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating ? 'Actualizando...' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoUpdate;
