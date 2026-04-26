import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/**
 * Componente que verifica la versión del sistema en el servidor
 * y fuerza una recarga si detecta un cambio.
 */
const AutoUpdate = () => {
    const [currentVersion, setCurrentVersion] = useState<string | null>(null);

    useEffect(() => {
        // 1. Obtener versión inicial al cargar la app
        const fetchInitialVersion = async () => {
            try {
                const res = await api.getHealth();
                if (res && res.version) {
                    setCurrentVersion(res.version);
                    console.log(`[VERSION-CHECK] Versión inicial: ${res.version}`);
                }
            } catch (err) {
                console.error('[VERSION-CHECK] Error obteniendo versión inicial', err);
            }
        };

        fetchInitialVersion();

        // 2. Intervalo de verificación (cada 10 minutos)
        const interval = setInterval(async () => {
            try {
                const res = await api.getHealth();
                if (res && res.version && currentVersion && res.version !== currentVersion) {
                    console.log(`[VERSION-CHECK] ¡Nueva versión detectada! Servidor: ${res.version}, Local: ${currentVersion}`);
                    console.log('[VERSION-CHECK] Recargando aplicación para actualizar...');
                    
                    // Pequeña espera para no interrumpir abruptamente si el log se ve
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }
            } catch (err) {
                // Silencioso para no molestar al usuario si hay un micro-corte de red
            }
        }, 10 * 60 * 1000); // 10 minutos

        // 3. Verificación al volver a la pestaña (Visibility Change)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Si el usuario vuelve a la pestaña después de mucho tiempo, verificamos de una vez
                checkNow();
            }
        };

        const checkNow = async () => {
            try {
                const res = await api.getHealth();
                if (res && res.version && currentVersion && res.version !== currentVersion) {
                    window.location.reload();
                }
            } catch (err) {}
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [currentVersion]);

    // Este componente también captura errores de carga de chunks (cuando el JS viejo ya no existe en el server)
    useEffect(() => {
        const handleError = (e: ErrorEvent) => {
            if (e.message && (e.message.includes('ChunkLoadError') || e.message.includes('Loading chunk'))) {
                console.warn('[VERSION-CHECK] Error de carga de fragmento detectado. Actualizando app...');
                window.location.reload();
            }
        };

        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, []);

    return null; // Componente invisible
};

export default AutoUpdate;
